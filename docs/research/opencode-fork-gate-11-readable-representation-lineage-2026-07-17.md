# OpenCode fork Gate 11: readable representation lineage

Status: Closed at implementation commit `bdbfa0c05`. Contract/theory and
implementation/evidence are independently accepted.
Whole-Gate review run `gate11-20260717-whole-01` closed findings `G11-CT-001`
through `G11-CT-012` and `G11-IE-001` through `G11-IE-003`. Deterministic/local
evidence, both packaged Windows families, and the maintainer-authorized real
configured-multimodal-provider run pass. The closure reviewer included the
current Roadmap 09 and confirmed that it preserves Gate 11's number,
representation boundary, and Gate 12/13 separation. Gate 12 and Gate 13 remain
outside this record.

Date: 2026-07-17

Parent roadmap: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Architecture: [Learning-centered system architecture](../architecture/00-system-architecture.md)
and [native learning data model](../architecture/01-native-learning-data-model.md)

Predecessors:
[passed Gate 9 source and Artifact authority](opencode-fork-gate-09-source-artifact-authority-2026-07-16.md)
and
[passed Gate 10 content-root authority and bounded observation](opencode-fork-gate-10-content-root-authority-2026-07-17.md)

Model-call composition dependency:
[passed Gate 4 learning-first composition boundary](opencode-fork-gate-04-learning-first-composition-2026-07-14.md)

Successor boundary: Gate 12 owns durable Turn lifecycle. Gate 13 owns Material
Map outline/selectors and optional Course alignment. Neither is part of this
contract.

Decisions: [ADR-0003](../decisions/0003-learning-state-follows-evidence.md),
[ADR-0006](../decisions/0006-atomic-local-learning-transaction.md),
[ADR-0008](../decisions/0008-model-write-initiative-and-durable-authority.md),
[ADR-0009](../decisions/0009-separate-invocation-and-semantic-effect-identity.md),
[ADR-0012](../decisions/0012-learning-centered-modular-monolith.md), and
[ADR-0014](../decisions/0014-one-time-opencode-fork.md)

This record owns the accepted Gate 11 engineering contract. Product meaning
and expensive boundaries under **Accepted maintainer decisions** come from the
maintainer and accepted architecture. Identity, lifecycle, storage, recovery,
and evidence sections are derived engineering proposals. A contradictory
implementation result may reopen those derived sections but cannot silently
change product meaning. A material product change returns to the maintainer;
contract acceptance requires a fresh independent top-level reviewer.

## Why this Gate exists

Gate 9 can name one exact immutable Artifact Revision and Gate 10 can acquire
authorized stable bytes, but neither makes non-model-friendly content honestly
reusable across later Turns or Sessions. Passing a PDF attachment once, keeping
tool output in a Session, or remembering a conversion in prompt history does
not establish durable readable content. Those paths may be re-encoded,
compacted, deleted with a Session, tied to one configured model, or detached
from the exact source revision that produced them.

Gate 11 serves the material-availability step of the learning loop:

```text
known exact Artifact Revision + learner-authorized long-term use
-> bounded conversion outside the database transaction
-> immutable accepted Representation Revision
-> exact bounded reads for later learning moves
-> Gate 13 may later add semantic selectors and Course alignment
```

It does not choose what to teach, interpret the material, create a Course,
select relevant passages, or claim that extracted text is semantically complete.

Its owned invariant is:

> Every accepted Representation Revision is immutable canonical Repa-owned
> content derived from the exact Gate 9 attribution and exact Gate 10 byte-read
> episode recorded in its source proof. The producer recipe, bytes actually
> presented at Repa's producer boundary, media profile, limitations, and storage
> identity are validated before acceptance. Historical reads always name that
> exact revision and reverify the managed object; current teaching use also
> requires Gate 9 ordinary-use eligibility and passes a mechanical drift/grant
> admission. Source correction, drift,
> retranslation, deletion, missing bytes, quality uncertainty, or a newer output
> never retargets an old reference or promotes uncertain text into source truth.

## Accepted maintainer decisions

### A representation is an access rendition, not a note or a second source

A Representation Revision is a typed, fidelity-limited access rendition of one
exact Artifact Revision. A local mechanical converter or a user-configured
multimodal model may satisfy the same semantic contract, but an explanation,
summary, study note, solution, or learner-authored correction is new learning
content or a new Artifact rather than a representation of exact source bytes.

The Gate 11 baseline contains no Repa-owned OCR engine, OCR model bundle, OCR
quality promise, or OCR configuration surface. PDF text-layer extraction is not
OCR. A configured multimodal provider may internally use whatever perception
mechanism it implements; Repa accepts only its explicitly limited model-produced
rendition and makes no OCR claim. Built-in local OCR is deferred rather than
permanently prohibited. It requires later product and engineering evidence,
such as a mature local-model path or materially changed learner privacy demand,
before a future contract may add it.

A readable original needs no fake representation row. Exporting accepted
representation bytes creates a learner-owned copy and, if admitted, a new
Artifact; it does not move or rename the canonical Representation Revision.

Several immutable Representation Revisions may coexist for one source Revision.
Gate 11 creates no mutable `current`, `preferred`, or `latest` representation
pointer. A caller must name an exact revision. Digest equality does not merge
independently authorized conversions or make one output replace another.

### Conversion is optional and authorization follows the learner's real request

An explicit request to teach from, revisit, or otherwise reuse a
non-model-friendly material over later Turns or Sessions is sufficient local
conversion intent. Repa does not add a redundant per-file confirmation when the
material and long-term purpose are already unambiguous.

A one-off question, attachment, generic read, search result, ContentRoot grant,
or Artifact admission does not by itself authorize persistent derived bytes.
The Tutor may offer conversion when concrete later value exists. Declining
leaves the Artifact known and the long-term readability limitation explicit; it
does not create a placeholder representation or a timeless preference against
future conversion.

Technical acceptance after an authorized local conversion is automatic. It
does not require the learner to preview and approve each output. Acceptance
means that lineage, storage, validation, and availability are truthful; it is
not an endorsement of semantic quality or completeness.

### Producer-neutral semantics have two real producers

The durable contract is safe for deterministic and nondeterministic producers.
It records the actual producer identity, producer revision, canonicalizer/profile
revision, a secret-free allowlisted provenance projection, typed bounded
diagnostics, exact output, and acceptance basis. It never persists raw effective
provider options or transport metadata, infers equivalence from a producer name,
or assumes rerunning a recipe yields the same bytes.

The first implementation proves both one local, program-owned, exactly pinned
PDF text-layer producer and one optional user-configured multimodal-model
producer through the inherited provider runtime. These are two real consumers
of one narrow trusted-producer boundary. They earn that boundary now; they do
not authorize a plugin platform, converter registry, arbitrary remote service,
or dynamically extensible execution interface.

“Trusted producer” means its local executable/module or configured provider/model
identity, purpose-owned allowlisted controls, fixed task/profile contract,
input/output handling, and invocation are selected by machine-user-owned Repa
code. Provider authentication and transport hooks may still supply credentials
needed to reach that configured provider, but those values are neither semantic
configuration nor durable provenance. Trust does not extend to source bytes,
output text, embedded metadata, provider behavior, or a fidelity claim.

### Quality uncertainty stays visible

Repa imposes no universal quality-versus-cost score. A lossy or uncertain
representation may be accepted only under a profile that states what it
mechanically preserves and omits. Learners and later Tutor behavior may inspect
the original, request a richer conversion, provide corrected readable content,
accept a named ambiguity, or stop using the source. None of those choices
changes what the accepted bytes were.

The model path has no semantic oracle that can prove nonempty prose is a faithful
rendition rather than a summary-like answer or a natural-language refusal. Repa
therefore rejects only machine-observable provider/filter/tool/truncation states,
empty output, and structural profile failures. A schema-valid successful result
is accepted as a **model-claimed rendition** with that epistemic limitation
recorded. It may still be summary-like or refusal-like in fact; acceptance does
not make the claim true, and inspect, reject/delete, correct-source admission, or
fresh retranslation remain the repair paths. Intentionally requested summaries,
notes, or explanations remain outside Representation authority.

The first PDF profile preserves page order, page boundaries, and extracted text
items. It explicitly does not claim to preserve two-dimensional reading order,
layout, handwriting, formulas represented only as graphics, figures, or other
non-text content. Source PDF metadata is an observation, not representation
identity or learning truth.

### Gate 11 closes exact reading; Gate 13 owns semantic selection

Gate 11 must make an accepted Representation Revision operationally usable
without Gate 13. It owns exact revision resolution, integrity and availability
checks, explicit budgets, and whole-document or mechanically bounded
profile-record reads.

Gate 11 does not own semantic passages, chunks, concepts, relevance ranking,
outlines, embeddings, search indexes, Course relations, or a default variant.
Gate 13 may later bind selectors to exact original or representation revisions.
It must use the Gate 11 read boundary rather than bypass managed storage.

## Current evidence and falsification pressure

### Accepted Repa authority

- The product foundation makes explanation and demonstration peer Tutor actions
  inside a long-running learning loop; representation exists to make exact
  material usable by those actions, not to turn practice or retrieval into the
  product center.
- ADR-0012 keeps source/artifact authority and Material Map authority separate
  from the Agent runner and from one universal graph or fact table.
- The accepted architecture requires canonical Repa-owned representation bytes,
  exact source and producer lineage, lazy derivation, explicit drift, truthful
  uncertainty, and later bounded retrieval. It expressly rejects a local-RAG
  subsystem and a universal quality policy.
- Gate 9 owns Artifact identity, exact source Revisions, ordinary-use
  withdrawal/correction-hidden disposition, availability, and correction. Gate
  11 may require and reference but not mutate or reinterpret them.
- Gate 10 owns durable ContentRoot authorization and stable local-NTFS reads.
  Gate 11 consumes exact bytes under the admitted immutable authorization
  snapshot; it does not acquire ambient path authority or turn later revocation
  into retroactive erasure.
- Gate 8 remains the owner of causal and physical settlement when a model-issued
  command accepts durable Representation state.

### Actual current fork

The current production fork has no Representation schema, managed
representation store, converter, or exact representation reader. Session Parts,
attachment transport, tool-output retention, Snapshot, and cache paths do not
own the required lifecycle and must not be relabeled as this authority.

The actual Gate 10 `ContentRoot.Interface.read` requires an active
`ContentRootID`, relative path, and byte bound. The current production interface
does not expose the broader workspace/one-off exact-read seam described in part
of the Gate 10 contract. Gate 11 therefore proves its first local path through
an active ContentRoot. It may also consume a future exact retained Revision
backing, but it may not pretend such backing or another read authority exists.
If exact bytes for the named Revision cannot be resolved, conversion fails
typed and creates no Representation Revision.

The fork can start and terminate ordinary child-process trees, including a
Windows `taskkill /T /F` fallback, but it has no operating-system sandbox
backend. Gate 11 can isolate parser crashes, bound time and output, avoid a
shell, and restrict Repa-selected paths; it cannot claim containment against a
malicious parser exploit.

The retained provider harness can register several providers and resolve an
exact `{ providerID, modelID }` per Agent, prompt, or delegated Task. Its model
catalog records text, image, video, audio, and PDF input capabilities, and the
message path already transports image/PDF attachments. This proves that a
configured multimodal producer does not need a second model runtime or a
single-provider product restriction. It does not yet provide Representation
identity, a fixed conversion task, or acceptance semantics.

Current production admits only `title`, `compaction`, and `project-copy-name` as
program-owned stream purposes. The Gate 4 owner correction included in this same
contract-review horizon proposes the closed fourth member `representation`; it
is not deferred to implementation evidence. Its only origin is the Gate 11
provider adapter after trusted conversion/source-proof admission. A hidden
Agent, ordinary Task, public field, persisted Message, source content, or plugin
cannot select it. The initiating Message's provider/model/variant, Agent prompt,
options, permissions and tools, caller system text, and command/Task overrides
are rejected or ignored; only the dedicated profile's machine-owned
provider/model, optional profile variant, allowlisted controls, fixed task, and
empty logical tool set apply. Transport authentication remains nondurable. Until
the Gate 4 correction and this record are accepted by the retained reviewer and
later implemented, production remains truthfully at three purposes and no
representation model call is authorized.

### Mature models adapted

- [W3C PROV](https://www.w3.org/TR/prov-dm/) separates entities, activities,
  agents, generation, and derivation. Gate 11 preserves the direct source,
  producer run, and output relation without copying a universal provenance
  graph.
- [SLSA provenance](https://slsa.dev/spec/v1.2/provenance) separates build
  definition, run details, and identified outputs. Gate 11 similarly separates
  a trusted recipe from one actual run and one accepted digest, without turning
  learning content into a software-supply-chain product.
- [RFC 9110 representation semantics](https://www.rfc-editor.org/rfc/rfc9110.html#name-representations)
  supports multiple typed representations of one resource. Gate 11 keeps exact
  variants rather than inventing one automatically moving canonical choice.
- [PDF.js](https://github.com/mozilla/pdf.js) is a mature Apache-2.0 PDF parser
  and renderer with an official `pdfjs-dist` package. Its page API exposes
  page-numbered text content and mechanical operator information. Repa uses
  those mechanics only for its first local profile and retains its own lineage,
  validation, storage, and lifecycle authority.

### Authorized local conversion probe

The maintainer authorized minimal read-only use of one external CS189 Spring
2026 lecture PDF. The source remained outside Git and was not copied into Repa:

- 2,332,310 bytes, 66 pages, source SHA-256
  `3ce3a99a62d85262767d049437ba817c20ce5e4f47f97fbdcc4a44272aa51b7a`;
- embedded title `Decision Trees`, contradicted by the visible Lecture 16
  entropy/information/logistic-regression content;
- page 2 supplied a text-only baseline;
- page 34 mixed text/formulas with 16 PDF.js image-paint operations; and
- page 44 mixed text, formulas, layout, and 6 image-paint operations.

An isolated, deleted-after-use probe ran `pdfjs-dist@5.7.284` under Bun 1.3.14.
It extracted 66 page records and 18,937 normalized characters. Two runs produced
the same probe-only canonical hash
`1afd01b1abeab96d3504bc984fa8755c40ff3491c0f50ebadcf3e795d2966ddd`.
PDF.js also emitted parser warnings. These observations prove that page-bounded
text is feasible and repeatable for this input while metadata, warning-free
exit, text count, and image-operation count remain insufficient semantic-
fidelity oracles. The probe hash is not a production serialization oracle.

## Proposed Gate result

After Gate 11:

- one exact Gate 9 Artifact Revision can have zero or more immutable accepted
  Representation Revisions;
- one concrete local producer converts an exact PDF byte snapshot into one
  versioned, page-structured UTF-8 text object through a framed parent-captured
  result buffer with explicit limitations;
- one optional producer sends exact supported media through the configured
  multimodal provider/model and accepts one versioned document-rendition UTF-8
  object with explicit model uncertainty;
- both producers cross one closed trusted-producer boundary without creating a
  plugin registry, second model runtime, or provider dependency in Core;
- conversion, cancellation, timeout, validation, publication, database
  acceptance, and cleanup have one truthful failure model;
- canonical bytes live in a database-identity-scoped Repa-managed area, not in
  the learner's source tree or Session storage;
- exact accepted bytes, complete source-proof snapshot, secret-free producer
  provenance, acceptance basis, availability history, and typed diagnostics
  survive restart;
- exact retry returns the already accepted result, while a fresh retranslation
  may create a separate sibling Revision even when bytes happen to match;
- every read names an exact Representation Revision, validates the complete
  managed object under an integrity ceiling, enforces independent return
  budgets, and exposes only structure declared by its exact profile;
- historical reads are explicit, while current teaching use mechanically binds
  an ordinary-use-eligible effective Artifact/current Revision and requires an
  exact inspectable old/new drift-pair grant when the representation is stale;
- explicit deletion, externally missing bytes, integrity mismatch, and exact
  restoration remain different states; and
- crashes may leave recognizable unreferenced staging or published files, but
  never an accepted row that was committed before publication.

This is a durable material-access boundary, not a complete learning loop.

## Identity and state vocabulary

1. **Artifact Revision.** Gate 9's exact immutable source-byte identity. Gate 11
   references its ID, exact effective attribution basis, media type, digest, and
   byte length without modifying them.
2. **Conversion intent.** A trusted operation envelope establishing that
   persistent readable derivation is authorized for one exact source Revision.
   It is not inferred from generic access.
3. **Source-proof snapshot.** The exact Gate 9 disposition version, lineage
   version, current Revision ID, AttributionBasis, and sourceVersion observed by
   the stable-read transition, plus the exact Gate 10 ContentRoot, binding and
   binding-episode IDs/ordinal, grant-episode ID/version, normalized relative
   path, object descriptor, observation time, and stable-read fingerprint that
   supplied the input. `sourceVersion` is observation provenance and the exact
   precondition for Gate 9's source transition; because it also advances for
   availability-only observations, it is not a later Representation semantic-
   eligibility predicate. The snapshot is a nonsecret receipt for the authority
   and bytes actually used, not a retained source copy or a claim that the
   ambient path can never change.
4. **Producer recipe.** Closed producer kind; machine-owned local
   module/package identity and version or configured provider/model identity;
   fixed task, canonicalizer, and profile identity/version; secret-free
   allowlisted purpose controls; supported input capability; and resource
   policy.
5. **Conversion run.** One local child execution or one explicit provider sample
   over the exact owned input snapshot. Its process or model-call identity,
   presented-input digest/length, result-boundary kind, captured-result
   digest/length, timing, finish status, typed warnings, provider-reported
   usage/cost when available, and partial output are operational facts, not a
   durable representation by themselves.
6. **Input snapshot, producer result, and publication stage.** The Gate 10 bytes
   are held in one caller-inaccessible parent-owned buffer and copied directly
   to the producer boundary; there is no reopenable input pathname. Each
   producer returns one bounded result captured in a parent-owned buffer. Only
   after that same buffer is validated and hashed may the parent write a
   publication stage outside the learner's tree and accepted namespace. None of
   these transient objects grants durable identity.
7. **Representation Revision.** Generated durable identity for one immutable
   accepted output and its direct derivation from one Artifact Revision. There
   is no separate mutable Representation identity or current pointer in this
   Gate.
8. **Representation profile.** Versioned output media/structure contract and
   explicit preservation/omission claims. It is not a quality score.
9. **Canonical object.** The one immutable managed file owned by a
   Representation Revision in the first implementation. It has a database-
   scoped storage key, media type, SHA-256 digest, and byte length.
10. **Availability version and event.** Append-only accepted observation of
    available, externally missing, integrity mismatch, exact restoration, or
    explicit deletion, plus a current projection guarded by exact version.
11. **Drift pair.** The exact old Artifact Revision represented and exact newer
    current Artifact Revision. A later third Revision is a different pair.
12. **Continued-use grant.** Versioned, inspectable learner authorization to use
    one named old Representation Revision for one exact effective Artifact and
    drift pair. It does not call old bytes current or select a preferred
    representation.
13. **Mechanical bounded read.** Whole-document or exact profile-record access
    with separate complete-object integrity-scan and returned-content budgets.
    It carries no semantic relevance claim.
14. **Current-use admission.** One atomic-snapshot read boundary that binds an
    exact Representation Revision to Gate 9's current effective Artifact and
    source Revision, plus an exact active drift-grant version when the represented
    Revision is old. It is distinct from historical inspection.
15. **Gate 9 ordinary-use eligibility.** The effective Artifact's current
    disposition has neither `withdrawalReason` nor `correctionHidden`, under one
    exact disposition version. Source availability remains a separate Gate 9
    fact. Conversion, continued-use grant issuance, and current teaching require
    this eligibility; historical inspection does not.

## Owned durable records

Exact SQL and TypeScript names remain implementation choices. Gate 11 requires
these meanings:

1. **Representation Revision.** Generated ID; exact source Artifact Revision ID;
   effective Artifact ID and complete Gate 9 AttributionBasis at acceptance;
   accepted disposition and lineage versions; observation-provenance
   sourceVersion inside the exact nonsecret Gate 10 source-proof snapshot;
   producer kind, local package or provider/model
   identity; fixed task/canonicalizer/profile identities; secret-free allowlisted
   producer-provenance projection and its version; presented-input digest and
   length; exact result-boundary kind; output media type; database-scoped storage
   key; the captured/published output SHA-256 and byte length; profile record
   count; typed bounded run diagnostics; acceptance basis; trusted acceptance
   time; and creation provenance. The row is immutable.
2. **Availability history.** Representation Revision ID, monotonic version,
   disposition, exact observed storage key/digest/length where applicable,
   basis, trusted time, and optional causal command/operation identity. The
   current projection is derived or transactionally maintained from this
   history. Explicit deletion is terminal for that Revision.
3. **Continued-use grants.** Effective Artifact ID, Representation Revision ID,
   old source Revision ID, newer source Revision ID, the newer Revision's
   AttributionBasis and Gate 9 lineage version at authorization, monotonic grant
   version, active/revoked disposition, exact learner basis, trusted times, and
   optional Gate 8 causal receipt. At most one active grant exists for the same
   representation, effective Artifact, and exact drift pair. A later current
   Revision or attribution/lineage correction does not mutate the grant but
   makes it ineligible for current use. Gate 9 sourceVersion and active-source
   availability are not grant identity.

Grant issuance first requires Gate 9 ordinary-use eligibility and revalidates
the exact disposition version, effective Artifact, current Revision,
AttributionBasis, and lineage version in its commit. Ordinary withdrawal
does not revoke or rewrite an active grant, but suspends its effect because
current-use admission is then ineligible. Ordinary restoration clears only that
withdrawal. The old grant becomes usable again without a new learner decision
only when it is still active and the exact effective Artifact, AttributionBasis,
old/current Revision pair, and recorded lineage version still match. It
does not resume through `correctionHidden`, changed attribution/current source,
or grant revocation. Restoration makes no source-availability claim; a later
direct source conversion still performs the Gate 10 stable read and Gate 9
source transition below. 4. **Causal and producer-call links when applicable.** Gate 8's existing exact
causal receipt, physical invocation, and semantic-effect identity remain the
owner when an interactive model initiates the conversion command. A distinct
configured multimodal producer run records its own narrow Gate 11 run
identity, provider/model identity, and result basis; it does not impersonate
the initiating command or establish Gate 12's general Turn/model-operation
meaning.
Deterministic sessionless operation records a narrow trusted operation
identity and learner basis instead of inventing a fake Message or Tool Part.

The producer-provenance projection is an explicit schema, not a redaction pass
over arbitrary provider objects. It may contain producer/profile/task versions,
providerID/modelID, a profile-selected variant name, declared native input
capabilities, Gate 11-owned numeric limits and sampling controls, terminal
status, and typed numeric usage/cost facts. It must never contain provider keys,
auth or cookie headers, secret-derived hashes, raw `Provider.Info`/model options,
raw request or response payloads, credential-bearing URLs, plugin transport
fields, stack/error objects, or arbitrary provider metadata. Diagnostics use a
bounded typed code/field allowlist; unknown values are omitted, not serialized
and later “redacted.”

A failed, declined, unsupported, timed-out, cancelled, or malformed conversion
does not create a Representation Revision. Its immediate operation result may
remain in the owning Interaction/tool result or terminal diagnostic only through
the same bounded typed nonsecret projection; raw provider errors/options/payloads
are not copied there. Gate 11 does not add a permanent conversion-attempt log,
universal job table, or negative preference record merely to count failures.

The first implementation gives each accepted Representation Revision its own
canonical object. It does not introduce cross-revision physical deduplication,
reference counting, garbage collection, or a general blob store. Exact replay
of one semantic effect reuses the same row and object.

## Identity, lineage, and retry rules

- A Representation Revision derives directly from exactly one Gate 9 Artifact
  Revision. Internal producer stages remain one recorded recipe/run; Gate 11
  does not expose recursive representation-of-representation lineage.
- The accepted source fingerprint must equal the bytes actually presented to
  the producer. Artifact currentness is checked separately from exact byte
  identity.
- A new producer version, allowlisted provenance projection, profile,
  intentional retranslation, or nondeterministic new run may create a sibling
  Representation Revision.
  None supersedes or withdraws another automatically.
- Exact replay under one Gate 8 semantic-effect identity or one deterministic
  operation identity returns the same accepted Representation Revision when
  effective Artifact, exact source Revision/AttributionBasis, intent, producer
  recipe, and delivery mode match. Operational source-proof observations,
  including availability-only sourceVersion or a later authorized Gate 10 read
  receipt after an unaccepted failure, do not manufacture a different semantic
  effect. Conflicting semantic reuse fails; an already accepted effect never
  starts a second conversion or selects whichever output won.
- A fresh intentional retranslation uses a fresh effect/operation identity.
  Equal output digest may be recorded as byte equality but does not collapse
  the two derivations.
- One run names one producer recipe. Local failure, empty local text, provider
  unavailability, or unsupported model capability never silently switches to
  the other producer under the same run identity. Another eligible recipe may
  be selected through a separately visible run under the still-valid conversion
  intent.
- A readable original, unsupported conversion, decline, or conversion failure
  creates no fake successful row.
- No output title, filename, model assertion, PDF metadata, or semantic
  similarity changes source attribution.

## Conversion authority and source preparation

Gate 11 receives a trusted conversion envelope naming:

- one exact Artifact Revision, effective Artifact ID, complete AttributionBasis,
  expected Gate 9 disposition/lineage versions, and the expected sourceVersion
  used only to commit the Gate 9 stable-read observation;
- one exact Gate 10 ContentRoot ID and normalized relative path selected from
  the Artifact's trusted source-location provenance;
- the accepted long-term-use intent or deterministic learner operation;
- one explicitly selected closed producer recipe;
- exact resource limits plus one cancellation owner that joins caller abort,
  timeout, and in-process root revoke/rebind requests; and
- Gate 8 causal/effect identity when the operation is model-issued.

The initiating model, producer model, or source document cannot supply an
executable path, package version, provider/model override, network URL, output
location, canonical profile, resource limit, or trusted configuration field.
Those values come from Repa code and machine-user-owned configuration. An
approved ContentRoot already authorizes bounded use by the configured Agent or
model whether remote or local; conversion intent separately authorizes the
durable derived bytes. Gate 11 adds no provider-by-root permission matrix.

Every producer begins with the same source path:

1. load the exact Gate 9 Revision, require the effective Artifact to be
   ordinary-use eligible, and snapshot its AttributionBasis plus independent
   disposition/lineage versions and observation-precondition sourceVersion;
2. require the exact envelope-named ContentRoot and normalized relative path to
   resolve to that source location and trusted observer provenance;
3. snapshot the root's exact BindingID, BindingEpisodeID/ordinal, and
   GrantEpisodeID/grantVersion, then perform Gate 10's stable bounded read;
4. apply the stable-read result through Gate 9's exact ordinary
   present/missing/changed transition, reload its winning attribution and
   versions, and continue only if it remains ordinary-use eligible and the
   resulting exact Revision/digest/length is the one named by the envelope;
5. construct the nonsecret source-proof snapshot from that committed Gate 9
   state and the immutable Gate 10 read receipt;
6. retain those returned bytes in one Gate 11-owned buffer that is not exposed
   through a mutable input path; and
7. present only that buffer to the selected producer boundary and require a
   matching presented-input digest/length before accepting its result.

Gate 11 never chooses among overlapping approved roots by path length, lexical
order, or whichever inventory happens to return first. The trusted envelope
must carry the exact root episode inherited from source admission or an explicit
learner-selected root. If the same canonical location is reachable through more
than one active root and no unique matching provenance episode is named, source
resolution fails as `ambiguous_content_root` before any producer call. Revocation,
rebind, or grant-version drift that wins before Gate 10 admits the stable read
invalidates the named episode rather than causing fallback to another root.

Once Gate 10 admits and completes that stable read, its receipt is immutable
authority for the bytes already disclosed to this conversion. A later root
revoke/rebind requests cancellation of the owning in-process conversion and
blocks every new read. If cancellation wins before Gate 11 acceptance, no row is
created. If the producer/acceptance transition wins, the recorded old receipt
remains valid and acceptance may finish; Gate 11 does not require the old root
episode to still be active or silently switch to another root. Restart never
recovers the in-flight run.

For the local child, the presented-input boundary is a dedicated binary stdin
pipe; the child hashes/counts all bytes it consumes and returns that attestation
in its framed result. For the model producer, the inherited provider adapter
constructs the native attachment directly from the same owned buffer and records
the raw attachment digest/length immediately before the one provider call. This
proves what Repa presented at its adapter boundary; it does not claim visibility
inside a remote provider.

Source withdrawal does not destroy old identity, but conversion requires
resolvable exact bytes. A stale old Revision may be converted only when an
accepted exact retained backing actually exists. Gate 11 does not add that
retention system. Missing, revoked, unreadable, changed, oversized, unsupported,
or otherwise unresolvable bytes fail before stable-read admission; later root
revocation follows the captured-snapshot race above.

No SQLite transaction remains open during source reading, child process work,
provider sampling, learner interaction, or output validation.

## First local PDF text profile

The first producer uses the official `pdfjs-dist` server/legacy build, pinned to
one exact package version in `bun.lock`, inside a dedicated Repa-owned Bun child
process. The implementation evidence may retain the probed `5.7.284` version or
adopt a newer exact release only after rerunning the same compatibility,
structure, cancellation, malformed-input, and representative-material checks.
Substituting a different producer family requires contract correction if its
ownership or failure semantics differ.

The child:

- is started directly without a shell, receives PDF bytes only through the
  dedicated binary stdin pipe, and receives only fixed numeric limits as
  machine-owned process arguments; stdin/stdout are anonymous handles inherited
  only by the parent/child pair, not named or reopenable paths;
- emits one bounded binary stdout frame containing the consumed-input
  digest/length, typed diagnostics, and canonical profile bytes. The parent
  captures the profile payload as one owned buffer; the child never receives an
  input or output pathname or a source-controlled URL;
- emits no durable database state and cannot choose its canonical destination;
- is killed as a process tree on cancellation or timeout;
- has bounded input size, page count, output size, stderr/diagnostic size, and
  wall-clock duration; and
- is parser fault isolation under the current operating-system account, not an
  OS security sandbox or hostile-document containment guarantee.

The child is a hidden release entrypoint, not a source-tree script dependency.
Every release family that claims this profile must compile/package that
entrypoint, the pinned `pdfjs-dist` runtime/assets, and its required license and
notice material. The installed Repa executable must be able to spawn it without
an external Bun installation, source checkout, or development `node_modules`.

The first accepted profile is one versioned UTF-8 structured-text object. It
contains an unambiguous ordered record for every PDF page, including an empty
record when no text is extracted. Each record carries only mechanical fields
needed to preserve page order/boundaries and optional bounded parser signals
such as image-paint-operation count. Source metadata and parser warnings remain
typed diagnostics, not document identity or extracted prose.

The profile declaration states that it preserves extracted text items and page
boundaries but does not preserve general two-dimensional layout, reading order,
handwriting, formulas or labels present only as graphics, figures, or image
pixels. It contains no OCR, raster-page bundle, image sidecar, summary, semantic
chunk, or model-authored repair. A later richer producer creates another exact
profile and Representation Revision.

The canonical serializer is versioned and deterministic for one exact producer
output. It defines Unicode normalization, line ending, page-record encoding,
ordering, escaping, and terminal newline. The contract does not use the deleted
probe serializer or its hash as that production format.

An all-empty local extraction is not accepted as readable content. This is a
structural profile failure, not a general quality score. It may make the
separately configured multimodal recipe eligible, but does not trigger a hidden
fallback or turn the failed local run into a successful model run.

## User-configured multimodal rendition profile

Gate 11 also admits one optional model producer through the inherited provider
runtime. It is a real representation producer, not OCR, an ordinary Tutor turn,
or a second Agent loop:

- machine-user-owned configuration selects an exact `providerID` and `modelID`
  plus an optional profile-owned variant and allowlisted Gate 11 controls for a
  dedicated `representation` profile; a missing, disabled, unresolved, or
  incapable profile fails before sampling and never substitutes the Tutor's
  current/default model or initiating Message variant;
- the program-owned `representation` internal purpose supplies a fixed
  non-replaceable rendition task, no Session history, no executable Agent,
  domain, MCP, or plugin tools, and `toolChoice: none`; configurable Agent text
  or options, caller system text, persisted `user.model.variant`, command/Task
  overrides, and semantic/parameter plugin additions cannot enter this purpose;
  raw provider/model option records and variant maps are not merged wholesale;
  after the dedicated profile selects its own variant, only the closed
  purpose-option schema may affect semantic sampling and unknown semantic keys
  fail configuration or are ignored before the call;
  provider authentication and transport-only headers may still reach the
  configured provider but cannot select the task/profile and are never durable;
- the provider sample uses a real existing initiating Session when the retained
  stream carrier requires one. Gate 11 never invents a Session, user Message, or
  Tool Part merely to call a model; a genuinely sessionless operation may select
  only the local producer;
- the exact staged source bytes are attached only when the resolved model
  truthfully advertises the matching native input capability: PDF for a PDF or
  image for an admitted image media type. Gate 11 performs no OCR, page
  rasterization, image extraction, source URL fetch, or modality-conversion
  fallback for this path;
- the baseline issues one bounded explicit provider sample per run. It applies
  source-byte, model-context, output-token/byte, diagnostic, and wall-clock
  bounds, propagates cancellation, and performs no application-level retry or
  crash resume;
- only a complete successful fixed-schema result with nonempty UTF-8 rendition
  text can become a candidate. Provider-declared refusal/filtering, tool use,
  truncation, malformed framing, unrecognized fields, provider failure, or
  unknown terminal status creates no Representation Revision. Natural-language
  refusal-like or summary-like text inside an otherwise successful rendition is
  not mechanically classified; it may accept only as a model-claimed rendition
  with explicit uncertainty; and
- the canonical model profile contains one document-level rendition record and
  explicit uncertainty/omission claims. Any page labels, reading order,
  formulas, diagrams, handwriting, or other source relations stated in its text
  are model assertions, not mechanically verified page structure or source
  truth.

The accepted record retains the configured provider/model identity, fixed task
and profile versions, profile-selected variant name when present, the explicit
secret-free Gate 11 provenance projection, exact returned bytes, terminal
status, and bounded typed usage/cost facts when the provider supplies them. It
does not retain raw effective options, provider/model records, headers, auth
material, transport diagnostics, or payloads, and does not claim access to an
immutable model-weight revision that the provider did not expose. A local
provider is allowed; a remote provider uses the same inherited provider and
account/privacy boundary as ordinary configured model use.

## Publication and atomic acceptance

For one successful conversion Repa:

1. allocates the semantic effect/operation identity and a candidate
   Representation Revision ID;
2. retains the Gate 10 input snapshot in the parent, runs the producer, awaits
   its real terminal status, and captures the local stdout payload or model
   result in one bounded parent-owned result buffer;
3. verifies the producer's presented-input digest/length against the source-proof
   snapshot;
4. validates that exact result buffer's complete output profile, UTF-8 encoding,
   exact profile-record
   sequence, declared bounds, diagnostics, and absence of
   trailing/unrecognized records;
5. computes output SHA-256 and exact byte length from that same buffer;
6. only then creates a new publication stage, writes that exact buffer, closes
   and durably flushes it as supported by the baseline, and atomically publishes
   it to a new caller-unselectable canonical storage key inside the same
   database-scoped managed area;
7. reopens the published object through the managed adapter's stable object
   identity, verifies key containment plus the expected buffer length/digest,
   and holds the verified handle/descriptor with write/replacement exclusion
   across the short acceptance commit; and
8. in one short SQLite transaction, revalidates the exact Gate 9 effective
   Artifact, ordinary-use eligibility/disposition version, exact current
   Revision, AttributionBasis, and lineage version recorded by the source proof;
   sourceVersion and active-source availability are deliberately not equality
   preconditions; and
9. only if those checks still match, commits the immutable Representation
   Revision, first available event, and Gate 8 domain/result settlement when
   applicable.

The acceptance linearization point is the database commit after publication.
Before it, cancellation may win and no Representation Revision exists. Once
the short acceptance transaction begins, Repa awaits its real result; a later
abort cannot report cancellation while a durable accepted row exists.

Publication followed by database failure leaves an unreferenced managed object.
It never returns success and never creates a database reference. A database
commit is forbidden before the final object is published and reverified. The
child never receives a publication path: validation and hashing cover the same
parent buffer captured from its stdout. Replacement before validation or between
validation and hashing therefore has no filesystem target; replacement of the
publication stage or canonical path before commit either fails stable-object
admission or disagrees with the buffer digest and creates no row. A release
family may claim this profile only when its managed adapter can exclude or
detect write/delete/replacement through the commit window.

A lineage correction, already-ineligible disposition, withdrawal, or source
Revision/AttributionBasis change that wins before the Gate 9 acceptance check
makes the run stale and leaves only reclaimable output debris. A same-Revision
missing or restored observation may advance sourceVersion and availability but
does not retroactively defeat the exact completed conversion. A ContentRoot
revoke/rebind after the completed stable read instead follows the cancellation
race above and does not invalidate its immutable receipt. Ambient source-path
mutation after the stable read does not change which Artifact Revision bytes
were presented. A later Gate 9 semantic change participates through the exact
disposition, current Revision, AttributionBasis, and lineage checks above;
availability-only observation does not. Sudden external loss of the canonical
output after commit becomes an availability failure on the next read; the
immutable record still tells the truth about what was accepted.

## Exact bounded read and current-use admission boundary

Historical inspection and current teaching use share one storage verifier but
are distinct public operations. Both require an exact Representation Revision
ID, a complete-object integrity-scan ceiling, and a returned-content byte/record
budget. The verifier:

1. loads the immutable record and current availability version and refuses a
   recorded object whose byte length exceeds the integrity-scan ceiling before
   opening it;
2. resolves its opaque storage key under the current admitted database's Repa
   representation root;
3. refuses absolute, escaping, cross-database, symlink/reparse, unexpected-type,
   or otherwise unverifiable storage objects;
4. streams the **entire** canonical object within the integrity-scan ceiling,
   verifies its exact byte length and SHA-256 digest, and validates complete
   profile framing before exposing any content; and
5. returns only complete requested content within the independent return-byte
   and record budgets.

The integrity-scan ceiling bounds total canonical-object verification I/O. The
return budgets bound only material delivered to the caller; they do not excuse
partial hashing. A whole-object request and the model profile's single document
record are all-or-nothing and fail `return_budget_exceeded` rather than return
partial framing. A local page-record range may return a complete ordered prefix
plus an exact next-page cursor and `truncated: true`; no individual record is
split, and a first record larger than the return budget yields no content. An
insufficient scan ceiling yields `integrity_budget_exceeded`, not missing or
integrity mismatch, because no contrary availability fact was proved.

`readHistorical` performs that exact verification and returns the acceptance
source proof with an explicit historical/audit disposition. It never claims that
the represented source is current and needs no drift grant. `readForCurrentUse`
is the only Gate 11 operation that may return Representation bytes for a current
teaching move. It:

1. loads the current effective Artifact, requires `withdrawalReason` to be absent
   and `correctionHidden` false, and snapshots its exact disposition version;
2. snapshots the exact Representation availability version, resolves its source
   Revision through Gate 9's current AttributionBasis, and requires the caller's
   exact effective Artifact ID to match that current attribution;
3. loads Gate 9's exact current Revision, AttributionBasis, and lineage version;
4. admits without a grant only when the represented source Revision is that
   exact current Revision; otherwise requires one active continued-use grant
   bound to the effective Artifact, Representation Revision, exact old/current
   Revision pair, current AttributionBasis/lineage version, and exact grant
   version;
5. performs the complete storage verification and bounded return outside the
   short database snapshot; and
6. before returning, revalidates ordinary-use eligibility/disposition version,
   exact effective Artifact/current Revision/AttributionBasis/lineage version,
   Representation availability version, and active grant/version from the
   admission snapshot. Any withdrawal/restoration ABA,
   correction-hidden state, drift, reattribution, grant revocation, third
   Revision, deletion, or availability race discards the buffered result and
   fails closed.

No caller supplies a filesystem path. Neither operation follows a newer
representation or preferred producer implicitly. The current-use operation
follows Gate 9 only to prove current eligibility for the exact requested
Representation; it never retargets that Representation or rewrites its accepted
source proof. Gate 13 and later Tutor consumers must use `readForCurrentUse` for
current teaching and may use `readHistorical` only when the historical nature is
part of the requested behavior.

`readForCurrentUse` reads already disclosed managed Representation bytes; it
does not reopen the source and does not require the old ContentRoot episode to
remain active. Gate 9 source availability still remains visible and may shape a
later Tutor decision, but it is not silently collapsed into Artifact
disposition, and availability-only sourceVersion changes are not current-use or
grant invalidation. A root revoke therefore blocks new source reads/conversions
without retroactively withdrawing an otherwise eligible Artifact or its
accepted Representation. `readHistorical` remains available even when the
Artifact is withdrawn or correction-hidden because it makes no ordinary-use
claim.

These are distinct capability/result types, not a caller-supplied `purpose`
flag on one byte-returning method. The Tutor/Material Map current-content path is
given only the current-use reader and consumes a result tagged with the exact
current-use basis/versions. Historical byte access is confined to explicit
learner inspection, audit, and future export owners; its tagged result is not an
input accepted by the current teaching context constructor. Focused dependency
and negative compilation/runtime tests must reject a Gate 13/Tutor bypass to raw
storage or the historical reader.

Record access exposes only structure owned by the exact representation profile.
The local PDF profile owns mechanical page-number and contiguous page-record
access; the model profile owns only its single document rendition record and
does not promote model-stated page labels into mechanical structure. Meaningful
passages, noncontiguous selectors, outline nodes, relevance, chunks, and Course
relations remain Gate 13. Gate 13 must persist exact revision-bound selectors
and cannot reinterpret an old record after retranslation.

## Availability, restoration, and explicit deletion

The current projection distinguishes:

- `available`: the canonical object most recently verified against the accepted
  key, length, and digest;
- `externally_missing`: no canonical object is present at the managed key;
- `integrity_mismatch`: an object exists but cannot be proven to be the accepted
  bytes or supported file object;
- `explicitly_deleted`: the learner-authorized terminal disposition for this
  Representation Revision.

Operational unreadability or database failure is not automatically
`externally_missing`. A failed read reports its typed cause. When missing or
integrity mismatch is proven, Gate 11 appends an availability event under the
exact expected version. Concurrent observations use compare-and-set semantics;
no last-write-wins status update occurs.

An externally missing or integrity-mismatched revision may become available
again only after the exact canonical bytes are restored at the exact managed
key and fully reverified. Restoration appends a new availability event. It does
not create a new Representation Revision or imply current-source suitability.

Explicit deletion is separate from Artifact withdrawal, source-file deletion,
ContentRoot revoke, Session deletion, and external absence. It requires exact
learner authority, Representation Revision ID, and availability version. The
implementation uses a recoverable same-managed-root prepare/commit protocol:

1. verify that the target is the accepted object or already proven absent;
2. if present, atomically move only those verified bytes to a deletion staging
   key that cannot be read as canonical content;
3. commit the `explicitly_deleted` event and Gate 8 result when applicable; and
4. remove the deletion-staged bytes after commit.

An object at the canonical key that is already unexpected or unprovable is not
eligible for the move: deletion fails, records `integrity_mismatch` when that
observation can commit, and leaves the object untouched. If the move succeeded
but the database commit did not, reconciliation is exact:

- canonical key absent and exact deletion stage present: restore, reverify, and
  return to `available`;
- canonical key already contains the exact accepted bytes: verify it as
  `available`, then remove only the redundant verified stage;
- canonical key contains unexpected bytes: never overwrite or delete them,
  retain the verified deletion stage, and record `integrity_mismatch` when the
  database is writable;
- both canonical key and exact stage proven absent: record
  `externally_missing`; and
- canonical inspection, stage inspection, or restoration operationally fails:
  return a typed unresolved recovery failure and preserve all reachable bytes;
  do not invent a semantic availability event until the state is proved.

Restart applies the same matrix when the database has not committed deletion.
When `explicitly_deleted` did commit, cleanup removes only a stage that verifies
as the exact accepted bytes. Any foreign object later occupying the canonical
key is reported as foreign debris while the Representation remains terminally
deleted; cleanup never removes it. Thus failed-commit recovery may end in
`available`, `externally_missing`, or `integrity_mismatch`, or remain an explicit
operational failure awaiting reconciliation. It is not forced into absence.

`explicitly_deleted` is terminal for that Representation Revision. Restoring
bytes manually does not reactivate it. A learner who wants readable content
again requests a fresh retranslation and receives a new Revision. Gate 11
performs no automatic eviction and no age-, size-, or recency-based deletion.

## Source drift and continued old-version use

When Gate 9 observes a newer current Artifact Revision, every old
Representation Revision remains immutable and available as historical exact
content. It becomes stale only relative to the new current source; no row,
storage key, digest, or selector is rewritten.

A current learning move may:

- decline retranslation and leave long-term current-source readability limited;
- request a fresh Representation Revision derived from the new exact source;
  or
- explicitly authorize continued use of one old Representation Revision for
  the exact old/new drift pair.

Every result names the old source Revision, new source Revision, and old
Representation Revision. Decline and failed retranslation do not become a
global negative preference. Continued-use authorization is durable because it
changes later eligibility; it is inspectable, versioned, revocable, and exact
to that pair. A third source Revision, another old representation, or a
different Artifact requires a different decision.

Issuing the grant requires the effective Artifact to be ordinary-use eligible
at both admission and commit. A later ordinary withdrawal suspends current use
without rewriting or revoking the grant. If ordinary restoration later clears
the withdrawal, the still-active grant resumes only when its exact effective
Artifact, AttributionBasis, old/current Revision pair, and recorded
lineage version remain unchanged; otherwise a new learner decision is
required. `correctionHidden` is not ordinary withdrawal and cannot revive a
grant through the restore operation. A same-Revision missing/restored source
episode may change Gate 9 sourceVersion and availability without changing or
suspending that exact grant.

The grant never relabels old bytes as a representation of the new Revision and
never makes the old representation preferred. Historical/audit reads that
explicitly request old exact content remain possible without claiming it is the
current source used for teaching. Current teaching use is not a caller promise:
it must pass `readForCurrentUse`. That operation rejects a missing/revoked grant,
a mismatched effective Artifact, or a third current Revision even while the old
bytes remain available to `readHistorical`.

## Concurrency, cancellation, and recovery

- Source attribution basis, ordinary-use disposition, Gate 9 disposition/lineage
  versions, exact current Revision, conversion identity, Representation
  availability version, deletion version, and drift-grant version are checked
  exactly. Gate 9 sourceVersion is retained as source-proof provenance but is
  not a later semantic equality check.
  Gate 10 binding/grant episodes are checked at stable-read admission and then
  retained as an immutable receipt; their later active versions are not an
  acceptance precondition. Semantic conflicts are returned, not silently
  retried.
- One semantic effect/operation identity has at most one accepted
  Representation Revision. Concurrent exact replays join or return that same
  result; conflicting reuse fails.
- Independent fresh conversion intents may run concurrently and create sibling
  revisions. There is no source-wide lock or automatic winner.
- Cancellation and timeout terminate and await the local producer tree or abort
  and await the provider stream. A root revoke/rebind requests the same
  cancellation for a conversion admitted under that episode; cancellation or
  acceptance wins once, and partial output is never validated or accepted.
- Restart does not resume or blindly replay a conversion run. Gate 8 or the
  deterministic caller settles/interprets the interrupted operation under its
  existing rules; a fresh authorized retry starts a new run under the same exact
  replay identity only where that owner permits it.
- Staging and orphan cleanup runs only on application wake, explicit cleanup,
  or relevant store use. There is no daemon. Cleanup scans only the strict
  database-scoped managed namespace, uses an age/ownership guard, consults
  current database references, and never removes an accepted available object
  or any learner source file.
- Orphan final objects from publication-before-database-failure and abandoned
  output/deletion stages are recoverable debris, not Artifacts or Representation
  Revisions.
- A representation read races safely with deletion or external mutation: it
  either verifies and returns the exact object under the old availability
  snapshot, or fails without returning mixed/unverified bytes. The accepted
  availability event records which side won.

## Learner, model, and program surfaces

Gate 11 exposes domain operations and reads, not a second Agent loop.

- A deterministic system/terminal operation may derive, inspect, read,
  retranslate, grant continued old-version use, revoke that grant, or explicitly
  delete under a trusted learner basis.
- A model may invoke the same fixed capability only through Gate 8's admitted
  physical/semantic settlement. It cannot authorize itself, select arbitrary
  code, or report success before the acceptance transaction commits.
- The configured multimodal producer is downstream of that trusted conversion
  intent. It supplies candidate rendition bytes under the fixed internal task;
  it cannot create another learning command, choose its own provider/profile,
  or authorize acceptance.
- Ordinary natural-language detection and first-run material bootstrap remain
  Gate 17. Gate 11 accepts the trusted intent envelope that future integration
  will produce; it does not add a hidden prompt workflow now.
- `readHistorical` is explicitly historical/audit access;
  `readForCurrentUse` is the mechanically admitted path for current teaching.
  Both are non-mutating except for truthful availability observation when the
  managed object is proven missing, restored, or mismatched.

The user-visible result distinguishes accepted, declined, unsupported,
cancelled, timed out, malformed, stale source, unavailable exact source,
external missing, integrity mismatch, and explicitly deleted. It never says
“read” or “converted” when only an attempt or partial file exists.

## Implementation ownership

- Representation identity, immutable lineage/source proof, availability
  history, continued-use grants, historical reads, current-use admission, and
  transition rules belong in a focused Core source/material module and the
  native LearnerHome database. They may extend the source side of the modular
  monolith but do not collapse into the Agent runner or a universal Artifact
  graph.
- Gate 9 remains the sole owner of Artifact/Revision identity, effective source
  attribution, and source availability. Gate 11 consumes exact reads and adds
  no representation rows to the Artifact revision table.
- Gate 10 remains the owner of ContentRoot authorization and stable local-file
  observation. Both producer paths use its actual active-root read API; neither
  bypasses it with a raw source path.
- A narrow managed-representation storage adapter owns database-scoped staging,
  parent-buffer publication, stable-object verification through the acceptance
  commit, verified reads, deletion staging, and cleanup. Its opaque keys resolve
  beneath the admitted Repa database identity and installation namespace, not
  beneath Session, Project, or learner content directories.
- `packages/opencode` owns the closed two-producer port, fixed PDF.js
  framed-stdin/stdout child-process adapter, configured multimodal provider
  adapter, Gate 4
  `representation` call origin, cancellation integration, bounded diagnostics,
  deterministic terminal surface, and Gate 8 model-tool settlement. Neither
  producer is a plugin host, and provider code remains outside Core.
- The Repa migration generator owns one forward migration from the accepted
  Gate 10 schema and regenerated fresh-database schema.
- Gate 13 later owns Material Map selectors and alignment. It consumes
  `readForCurrentUse` for current teaching or explicitly labelled
  `readHistorical` access through the Core boundary and does not import storage
  internals.

The local and configured-model producers are the two real consumers that earn
one narrow trusted-producer port. It is a closed program composition, not
dynamic registration. Package placement does not authorize a
`converter-manager`, generic job queue, repository/controller layer, universal
media ontology, plugin converter API, or new runtime.

## Failure behavior

- Already withdrawn, correction-hidden, unresolvable, attribution-stale,
  ambiguous-root, pre-read revoked/rebound episode, mismatched, unreadable,
  oversized, encrypted-unsupported, or unsupported-media source bytes fail
  before producer admission. Post-read root revoke/rebind follows the explicit
  cancellation-versus-acceptance race and does not invalidate disclosed bytes.
- Child spawn failure, parser crash, timeout, cancellation, output overflow,
  page overflow, diagnostic overflow, malformed framing, invalid UTF-8,
  impossible page sequence, or failed profile validation creates no accepted
  row.
- The child receives no output path. Missing/malformed stdout framing, input
  attestation mismatch, any child-visible filesystem output target, or a
  publication-stage/canonical object whose stable identity, length, or digest
  differs from the validated parent result buffer creates no accepted row.
- Missing/unresolved configured model, capability mismatch, provider/auth
  failure, provider-declared refusal/filtering, tool call, incomplete finish,
  model-output overflow, invalid fixed schema, or unreported successful terminal
  completion creates no accepted model-produced row. Schema-valid
  natural-language refusal-like or summary-like text is not claimed to be
  machine-detectable and can accept only under the model-claimed-rendition basis.
  The runtime does not fall back to the Tutor model or local producer under the
  same run identity.
- A warning may accompany a valid limited profile but is bounded and recorded;
  neither zero warnings nor nonempty text proves fidelity.
- Publication failure creates no database row. Database failure after
  publication creates only recognizable unreferenced managed bytes.
- A duplicate semantic-effect identity with a different effective Artifact,
  exact source Revision/AttributionBasis, producer, profile, allowlisted
  provenance projection, authorization intent, or delivery mode conflicts before
  a second effect. A provenance-only sourceVersion/availability change is not a
  different semantic source.
- Missing or altered canonical bytes are never returned under the accepted
  digest. They append availability truth when that truth can commit.
- Source drift does not delete, overwrite, rebind, or automatically regenerate
  an old Representation Revision.
- Historical reads remain explicitly historical. Current-use admission with a
  withdrawn/correction-hidden Artifact, missing grant, wrong old/current source,
  third current Revision, wrong representation/effective Artifact,
  disposition/lineage/Representation-availability/grant version mismatch,
  reattribution, revoked grant, or disposition ABA fails closed without returning
  buffered content. Gate 9 availability-only sourceVersion change is not on this
  failure list.
- Explicit deletion never follows a caller path and never removes bytes whose
  identity/digest is not the accepted target. Crash at every deletion boundary
  resolves to available, externally missing, integrity mismatch, explicitly
  deleted, or a typed unresolved operational failure without a false success.
- Cleanup never scans the learner tree, deletes a database-referenced available
  object, or treats age alone as semantic deletion authority.
- Restart does not convert an operational attempt into success or infer a
  learner decision from staging debris.

## Explicit non-goals

- no Material Map, outline, semantic selector, chunk ontology, embedding,
  vector index, full-text relevance search, top-k retrieval, or RAG pipeline;
- no Course, Course alignment, learner record, Agenda, Goal, Tutor-policy, or
  durable Turn work;
- no natural-language bootstrap or claim that ordinary reads automatically
  create representations;
- no mandatory conversion, automatic source-drift retranslation, preferred or
  latest pointer, background watcher, daemon, or automatic eviction;
- no Repa-owned OCR engine/model/configuration/quality promise, audio/video
  transcription, page rasterization, raster-page bundle, image extraction,
  multimodal archive, summary, note, explanation, or silent model-written repair
  of the local profile;
- no arbitrary executable, plugin, general remote converter service, converter
  marketplace, dynamic producer registry, or provider path other than the
  inherited configured-model runtime;
- no operating-system sandbox or claim that adversarial documents are contained
  from the current machine user;
- no retained exact-source snapshot system, source-file deletion, Artifact deep
  deletion, export workflow, cross-authority Data Lifecycle, shared blob store,
  or garbage collector;
- no rewriting of Gate 9 Revisions, historical context, or future Gate 13
  selectors; and
- no Gate 12 or Gate 13 implementation or review.

## Closing evidence required

The contract does not let Gate 11 close without focused evidence for at least:

1. **Schema and migration.** Fresh database and Gate 10 upgrade paths contain
   immutable Representation/source-proof, availability, secret-free provenance,
   and exact drift-grant constraints; migration generation is equivalent;
   restart preserves every accepted state.
2. **Exact source proof.** One Gate 9 Artifact Revision and one explicit Gate 10
   ContentRoot episode supply exact matching bytes and persist the complete
   attribution/access receipt. Already withdrawn, correction-hidden, lineage
   correction or withdrawal during conversion, wrong Revision,
   changed/oversized/missing source, ambiguous overlapping roots, and pre-read
   revoke/rebind/grant-version drift fail without an accepted row. A
   post-stable-read revoke/rebind blocks new reads and requests cancellation:
   evidence controls both outcomes, cancellation with no row or acceptance under
   the unchanged recorded receipt. The receipt preserves the observed
   sourceVersion, while a later same-Revision missing/restored observation may
   advance sourceVersion without defeating the candidate. The local child
   consumes only the stdin snapshot and reports the matching digest/length; the
   model attachment records the same boundary attestation.
3. **Concrete PDF conversion.** The pinned PDF.js adapter converts a small
   repository-owned deterministic fixture and the maintainer-authorized external
   representative material without importing that material. Page order,
   empty/text/mixed pages, metadata mismatch, warnings, formulas/layout limits,
   and non-text mechanical signals remain truthful; an all-empty document is a
   typed no-readable-output failure rather than a fake accepted representation.
   The child emits one framed stdout result and receives no output path. Attempts
   to replace output before validation, between validation/hash, and between
   hash/publication either have no child-visible filesystem target or fail the
   parent-buffer/stable-publication identity and digest oracle.
4. **Packaged local path.** An offline smoke invokes the real installed/compiled
   Repa executable and hidden child entrypoint on every release family that
   claims the PDF profile—at minimum the current Windows x64 baseline. It proves
   conversion, process-tree cancellation, awaited cleanup, packaged
   `pdfjs-dist` runtime/assets, and required license/notice material with no
   source checkout, development `node_modules`, external Bun, or network.
5. **Configured multimodal conversion.** A real machine-user-configured
   multimodal model, selected independently of the Tutor model and allowed to
   use a repository-owned or separately upload-authorized fixture, receives the
   exact supported media through the inherited provider runtime. Exact
   provider/model/profile-variant selection, capability mismatch, missing
   profile, no-default fallback, one-call bounds, cancellation,
   provider-declared refusal/filtering, tool-call rejection, truncation,
   malformed output, terminal status, and typed usage/cost facts settle
   truthfully. The accepted bytes and uncertainty—not a predetermined semantic
   transcript—are the oracle.
6. **Composition authority.** Gate 4's owning record, closed internal-purpose
   union, request preparation, real provider carriers, and focused tests are
   revised for the exact `representation` origin. Public prompts, hidden Agents,
   Tasks, persisted messages, source content, `user.model.variant`, Agent
   options, and semantic/parameter plugins cannot forge that purpose or affect
   its fixed no-tool task/profile. A profile-owned variant remains permitted;
   transport authentication remains nonsemantic and nondurable. The model path
   reuses a genuine initiating Session and refuses rather than synthesizing
   Session/Message/Tool identity when none exists.
7. **Secret non-persistence.** Distinct canary secrets placed in provider keys,
   headers, URLs, arbitrary options, plugin fields, auth failures, provider
   failures, and raw error objects never appear in SQLite, canonical objects,
   operation results, diagnostics, logs, snapshots, or retry identities on
   success or any failure path. Only the typed allowlisted provenance projection
   persists.
8. **Profile and semantic acceptance.** Invalid UTF-8,
   duplicate/missing/out-of-order local pages, invalid model framing, truncated
   records, unrecognized fields, output overflow, and forged diagnostics fail.
   A schema-valid model result that is semantically summary-like or refusal-like
   demonstrates the explicit model-claimed-rendition limitation rather than an
   impossible semantic rejection oracle.
9. **Atomic acceptance and races.** Failure injection around producer exit,
   parent-buffer framing, validation, hash, publication-stage write, publish,
   stable-object reopen verification, Gate 9 eligibility/version revalidation,
   database insert, and Gate 8 result settlement yields either no accepted row
   plus recoverable debris or one fully readable accepted Revision. Concurrent
   lineage correction, already-ineligible disposition, or withdrawal makes the
   candidate stale; actual current-Revision or AttributionBasis drift also
   fails. Missing/restored availability observations that preserve the exact
   Revision/AttributionBasis may advance sourceVersion before acceptance and
   still accept. A post-read ContentRoot revoke/rebind instead proves the two
   legal cancellation/acceptance outcomes under the immutable receipt, never a
   fabricated current episode.
10. **Cancellation and producer failure.** Pre-abort, cancellation during local
    parse or provider streaming, timeout, child crash, spawn/auth/provider
    failure, process-tree termination, and awaited provider abort settle
    truthfully and leave no running producer or accepted partial output.
11. **Exact retry and concurrency.** Same-effect retry returns the same Revision;
    semantically conflicting reuse fails; availability-only sourceVersion or a
    fresh authorized read receipt after an unaccepted failure does not become a
    different semantic source. Independent fresh conversions can coexist; equal
    output digests do not merge or move a preferred pointer; producer-family
    fallback cannot reuse the failed run identity.
12. **Bounded exact reads.** Whole and exact profile-record reads independently
    test complete-object integrity-scan ceilings and return byte/record budgets.
    A large object with a small page return proves full hash verification without
    exceeding the return budget; too-small scan ceiling, too-small single-record
    budget, record-prefix truncation/cursor, wrong ID, escaping key,
    symlink/reparse object, concurrent mutation, missing bytes, and integrity
    mismatch all follow their exact no-unverified-content oracle.
13. **Availability and restoration.** Missing, mismatched, exact restoration,
    concurrent observations, database failure, and restart preserve append-only
    versioned truth without changing immutable representation identity.
14. **Explicit deletion.** Present, already missing, initially mismatched,
    stale-version, concurrent read, failure before move, and failure before/after
    database commit are covered. Recovery separately tests an absent canonical
    key, exact accepted bytes already restored, unexpected bytes occupying the
    canonical key, missing stage, operational inspection/restore failure,
    committed deletion, restart, and post-commit cleanup without deleting or
    overwriting unexpected bytes.
15. **Current-use drift matrix.** Same-current-Revision use succeeds without a
    grant. Exact old/new pair decline creates no preference; old-use grant and
    revocation affect only the named effective Artifact/pair; no-grant current
    use fails; a third source Revision, reattribution, wrong representation, and
    stale grant version fail closed. Already-withdrawn and correction-hidden
    conversion, grant issuance, and current use fail; historical read remains
    available. Withdrawal during admission fails by disposition version.
    Ordinary restoration resumes a still-active old grant only when its exact
    effective Artifact, attribution, pair, and recorded lineage version are
    unchanged; correction-hidden or changed basis requires a new decision.
    Present→missing and exact same-Revision restoration may advance Gate 9
    sourceVersion/availability repeatedly without invalidating the grant or
    current-use admission; actual Revision drift still fails.
    `readForCurrentUse` returns no stale buffered content. Capability/result-type
    tests prove a Tutor/Material Map current path cannot substitute the
    historical reader or raw managed bytes.
16. **Cleanup scope.** Orphan output/published/deletion stages are removed only
    within the admitted database-scoped store after age/reference checks.
    Retained recovery stages, accepted bytes, another database/channel, foreign
    canonical objects, and learner source files survive.
17. **Ownership and non-implication.** Focused dependency/import checks prove no
    provider/Session owner in Core, no raw storage bypass, no Artifact schema
    collapse, no second runtime, and no Gate 12/13, RAG, Repa-owned OCR, plugin
    converter, or generic remote-conversion framework.

Documentation-only contract work requires diff, link, heading, status, and
worktree checks. Implementation evidence runs focused Core
migration/authority tests, the owning OpenCode converter/integration tests,
affected package typechecks, migration equivalence, and only broader checks
justified by actual dependency reach.

## Independently accepted implementation and evidence

The maintainer separately authorized implementation after contract/theory
acceptance. The retained reviewer independently accepted the current
working-tree implementation and evidence. Maintainer-authorized commit
`bdbfa0c05` fixes its durable provenance and formally closes Gate 11.

### Implemented ownership boundary

- Core owns immutable Representation/effect identity, the complete Gate 9 and
  Gate 10 source proof, closed secret-free producer provenance, append-only
  availability, exact historical/current-use readers, exact drift grants,
  explicit deletion, reconciliation, and database-derived cleanup references.
  Artifact, ContentRoot, Session/provider, and raw managed-storage ownership
  remain separate.
- The managed object adapter derives one installation-channel and physical-
  database namespace, accepts only opaque revision-bound keys, holds verified
  Windows NTFS object identity across acceptance, independently bounds full
  integrity scans and returned content, and preserves foreign/reparse objects.
- OpenCode owns source preparation and producer execution. It uses Gate 10's
  real stable read, commits the Gate 9 observation transition, retains the
  immutable receipt, and runs either the pinned local child or the dedicated
  configured-model carrier over the same parent-owned byte snapshot.
- The local PDF producer pins `pdfjs-dist@5.7.284`, uses stdin and one framed
  stdout result with no input/output pathname, validates the child attestation,
  and packages the runtime, assets, license, and hidden compiled child.
- The configured-model producer resolves one machine-user profile, requires a
  genuine initiating Session/user Message, excludes initiating model/variant,
  Agent/system/history and arbitrary semantic plugin/provider options, and
  makes one no-tool, no-retry, telemetry-disabled bounded provider call.
  ChatGPT OAuth reuses the inherited OpenAI plugin and omits that backend's
  unsupported `max_output_tokens` transport field while requiring terminal
  usage and rejecting missing or over-profile output-token usage. Other
  provider transports retain the supplier-side token parameter.
- Gate 8 settlement now admits the closed `representation.convert` capability
  and atomically commits one Representation result, one causal receipt, one
  physical settlement, and one terminal Tool Part. The model does not choose
  producer kind; the trusted interactive policy maps PDF to the local producer
  and supported images to the configured multimodal producer. Deterministic
  terminal operations may explicitly select either eligible recipe.
- The deterministic `content representation` terminal surface exposes exact
  convert/list/show, historical/current reads, continued-use grant/revoke,
  deletion, and reconciliation operations. No preferred/latest pointer,
  automatic conversion, OCR, RAG, Gate 12/13 owner, or generic converter
  registry was added.

### Current author evidence

| Claim                                                               | Evidence result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema, Gate 10 upgrade, fresh schema, and restart                  | The independently refreshed 14-file Gate-scoped Core combination passed 121/121 tests with 751 assertions. It includes a production-foreign-key, populated Gate 10 upgrade carrying both a settled learning-command receipt and the active ContentRoot binding/grant/current chain, plus failure rollback with foreign-key enforcement restored. Fresh/upgrade equivalence, immutable acceptance and restart, exact source proof, availability history, grants, deletion/recovery, cleanup, format profiles, typed process timeout, process-tree interruption/timeout cleanup, and Gate 8 settlement also pass. |
| Migration generation                                                | `bun run script/migration.ts --check` from `packages/core` reported no incremental schema change and generated an equivalent full schema.                                                                                                                                                                                                                                                                                                                                                                                                           |
| Core ownership and type safety                                      | `bun run typecheck` passed in `packages/core`; the focused ownership test proves the sole production raw-storage importer is the Core Representation authority, rejects Session/provider/Agent/LLM ownership there, preserves separate Artifact/Representation tables, and finds no adjacent OCR/RAG/plugin/remote-converter/Gate 12/13 module.                                                                                                                                                                                                     |
| Source preparation, producer execution, composition, and settlement | The refreshed 10-file Gate-scoped OpenCode combination passed 180/180 tests with 702 assertions. It covers exact and ambiguous roots, wrong/missing/changed/oversized source, pre-abort, Gate 9 semantic races, availability-only sourceVersion changes, nonretroactive post-read revocation, both producers, fixed composition, provider lowering, secret canaries, runtime settlement/recovery, Session lifecycle, and reserved tool registration. New causal traces preserve caller and root-revocation cancellation through the composed local producer, distinguish typed timeout, malformed output, and ordinary producer failure in durable Gate 8 settlements, publish no Representation on any of them, await timeout cleanup, and exactly replay the stored timeout result. The included Representation-model suite remains 11/11 with 100 assertions, including the OpenAI OAuth transport correction and output-token ceiling. |
| OpenCode type safety                                                | `bun run typecheck` passed in `packages/opencode` after the implementation-review repairs, including the packaged child, hidden parent-owned cancellation probe, closed failure mapping, and guarded real-model evidence runner.                                                                                                                                                                                                                                                                                                                        |
| Closed profiles and bounded reads                                   | PDF/model/frame tests reject invalid UTF-8, page gaps/duplicates/reordering, unknown fields, truncation, noncanonical bytes, forged diagnostics, and total overflow. Authority/storage tests separately prove full-object scan ceilings, return byte/record budgets, complete-record cursor behavior, a 512 KiB object with a small first-page return, wrong IDs/keys, missing/mismatched/reparse/busy objects, and no unverified content.                                                                                                          |
| Availability, deletion, and cleanup                                 | Failure injection and restart cover exact restoration, concurrent observation, database failure, missing/mismatched/foreign canonical objects, deletion rollback and retained stages, busy objects, committed cleanup, young versus old orphan/stage handling, accepted references, retained recovery, another physical database, a sibling installation-channel sentinel, and learner-source survival.                                                                                                                                             |
| Packaged release path                                               | From pre-build candidate aggregate `81737b926433b20df4bcbb570dabb0a0957abc555977089ce0e77af314bd5436` (6,352 tracked/untracked nonignored files) and authority aggregate `324cd49b60b0239a8e827f65369980b5d6eaee0255c5204efc2c2ae64aeccbdb`, `MODELS_DEV_API_JSON=test/tool/fixtures/models-api.json` (SHA-256 `d83d2622e60deeb2af79080dffbc6b7b89016f009b0bfca97696793b02f97722`) plus `bun run script/build.ts --single --baseline --skip-install --skip-embed-web-ui` rebuilt and passed Windows x64 and x64-baseline in one invocation. Each complete `bin` tree was copied outside the checkout and run under a closed environment/PATH. Each compiled main completed ContentRoot → PDF conversion → current-use read. Separate hidden main commands spawned exactly one sibling worker; the x64 trace bound parent PID 7760 to worker PID 3004 and the baseline trace bound parent PID 6700 to worker PID 49552, with each executable path inside its copied package. The harness sent cancellation only to each main and accepted `cancelled_and_reaped` only after the main awaited worker cleanup; no worker remained. x64 main/worker are 141,757,952 bytes / SHA-256 `8ba7d29e549b47475f7424a85f62931488e5c8b8966d7cc3d3edc1799826aecc` and 99,346,432 bytes / `1d2adcca72a034a8cc564e87fc80cce5ee9903b5627b929344d5cdc59d933ebf`; baseline main/worker are 141,035,008 bytes / `a8f1b243d63769de23144145bb15061db4e182f0eb768ff8b7ad1f7a109b9234` and 98,623,488 bytes / `d65c5385df255e27a4911d50017e946260e0bd490bdd12367f81e14a5091730f`. Each family carries the same 207-file asset/license aggregate `1a10ef8a2aa291afe9ece2414188ef24c2bd0fa5e84c54e59b2037183e27e601`. |
| Authorized representative local PDF                                 | The production child converted the authorized external 2,332,310-byte, 66-page CS189 source twice without copying or uploading it. Both runs produced the same 83,092-byte profile SHA-256 `3a07a74640ae89a99ae5fcc1215854f953dd21428dfe5c7c138c69d8aa7fbc2d`: 66 records, 1,704 text items, 23,135 operators, 247 image-paint operations, 66 signal pages, and two bounded parser-warning events. The source SHA-256 remained `3ce3a99a62d85262767d049437ba817c20ce5e4f47f97fbdcc4a44272aa51b7a`; no source material entered Git or a provider.    |
| Real configured multimodal provider                                 | Maintainer-authorized run `gate11-openai-oauth-real-model-01` passed on 2026-07-18 through Repa's inherited OpenAI OAuth plugin and `openai/gpt-5.5`, without CodexCont, Claude Code, a new provider owner, or a credential copy on disk. The guarded runner used only the repository-generated 210-byte 64×48 PNG (SHA-256 `d6edbd3dee9c5b771a4bd8140258bdded5196b7880d9dd6ab6369d1ca7d79c37`), an isolated database/configuration, a 512-output-token and 60-second profile, zero retry, and the production conversion path. It accepted one 517-byte Representation (SHA-256 `e17debc6df8f496c55fca9f1fc6eba74f6adff366fda588ed15e002a8c7f8ff9`) with terminal `stop`, reported 438 total / 289 input / 98 output / 51 reasoning tokens, reconciled the exact retry as `already_accepted`, and admitted `current_revision` use. Stderr was empty; access, refresh, and account canaries were absent from output; the Codex auth refresh timestamp was unchanged; and the isolated state was removed. The secret-free result projection has SHA-256 `e8afcaa8bf38fff67c47ba3efeda2a21e3278497968c88509cff07fc93b33c31`. |

`git diff --check` was clean apart from ordinary working-copy line-ending
warnings before the final evidence update. Documentation link, heading, diff,
and worktree checks remain part of the implementation-review dispatch
preflight.

## Design evidence provenance

| Source                                                               | Pin / status                                                                                                                        | Preserved invariant                                                                                                                                                                                                                             | Deliberate difference                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repa foundation, accepted ADRs, architecture, and audited Roadmap 09 | Current maintainer working tree on 2026-07-17; active status remains `docs/README.md`                                               | Optional exact representation, separate authorities, bounded retrieval, truthful uncertainty, no RAG                                                                                                                                            | Gate 11 makes the accepted semantics concrete without prewriting Gate 13 or later product integration                                                                                                                                                                                                             |
| Gate 9                                                               | Passed implementation `41db7c292`                                                                                                   | Stable Artifact identity, immutable exact Revisions, AttributionBasis, ordinary-use withdrawal/correction-hidden disposition, independent disposition/source/lineage versions, availability, and no representation folded into source revisions | Gate 11 persists the complete observation snapshot, but later semantic admission revalidates only ordinary disposition/version, exact current Revision/AttributionBasis, and lineage version; sourceVersion remains provenance. Historical reads remain separate while Gate 11 adds only derived managed content. |
| Gate 10                                                              | Passed implementation `fb6ed5763`                                                                                                   | Active ContentRoot authority, immutable admitted-operation snapshots, nonretroactive revocation, and mutation-safe bounded local-NTFS reads                                                                                                     | The first path uses the actual `contentRootID` interface, records the exact binding/grant/read receipt, rejects ambiguous overlapping roots, requests cancellation on later revoke/rebind without retracting disclosed bytes, and makes no unsupported workspace/one-off claim                                    |
| Gate 4                                                               | Closed historical three-purpose implementation plus the Gate 11 owner correction accepted in this whole-Gate horizon                 | Program-owned internal purpose is a call-origin fact; caller-controlled model/variant/options do not replace the fixed task; internal calls have no domain tools                                                                                | `representation` is a strict fourth target owned only by Gate 11, with a distinct profile variant and no caller/Agent/plugin parameter inheritance; implementation provenance is fixed by `bdbfa0c05`                                                                                                               |
| Current Repa fork                                                    | Gate 11 implementation commit `bdbfa0c05`                                                                                           | TypeScript/Bun modular monolith, native database, Effect services, child-process cancellation, multiple configured providers/models, explicit image/PDF capabilities and attachment transport                                                   | Session/tool/cache bytes are rejected as representation authority; the inherited provider runtime is reused without creating a second runtime or provider owner in Core; no inherited sandbox claim                                                                                                               |
| W3C PROV, SLSA provenance, RFC 9110                                  | Published standards/specifications linked above                                                                                     | Direct source/activity/output lineage, recipe/run separation, multiple typed representations                                                                                                                                                    | No universal provenance graph, software-build ontology, or HTTP resource model is copied                                                                                                                                                                                                                          |
| PDF.js                                                               | Official Apache-2.0 project; isolated probe used `pdfjs-dist@5.7.284`                                                               | Mature page parsing, text-item and mechanical page/operator access                                                                                                                                                                              | Repa owns canonicalization, limitations, process/resource boundary, storage, identity, and acceptance                                                                                                                                                                                                             |
| Authorized CS189 Lecture 16 PDF                                      | External read-only local evidence; exact source digest recorded above; never copied into Git or authorized here for provider upload | Representative text-only, formula/layout, non-text, warning, and metadata-mismatch pressures                                                                                                                                                    | It informs only the local PDF profile and evidence matrix; model-producer qualification uses repository-owned or separately authorized media and treats output as uncertain rendition, not semantic truth                                                                                                         |

No source code or sample material was copied from external evidence into this
contract. The temporary PDF.js probe and installed dependencies were deleted
after their bounded question was answered.

## Independent whole-Gate review state

Whole-Gate review run `gate11-20260717-whole-01` was retained throughout in
top-level reviewer task `019f6fbc-6afb-7b50-a0dd-53058fecf778`. Its initial
contract/theory pass returned `Revise` with findings `G11-CT-001` through
`G11-CT-008`. The first repair round closed all eight and returned `Revise` with
new findings `G11-CT-009` through `G11-CT-011`. The second repair round closed
those three and returned `Revise` with new finding `G11-CT-012`. The third
repair round closed that finding, confirmed `G11-CT-001` through `G11-CT-011`
remained closed, found no new acceptance-changing defect, and returned `Accept`.
The maintainer later authorized the current implementation. The retained
reviewer judged its first implementation/evidence snapshot `Revise`, then
re-read one stable repaired snapshot, closed all three findings, found no new
acceptance-changing defect, and returned `Accept` for that layer.

Original finding disposition from the retained reviewer:

| Finding      | Closed repair in the reviewed horizon                                                                                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `G11-CT-001` | Gate 4 now owns the proposed fourth purpose before implementation, including its sole origin and the exact disposition of initiating Message variant, caller/Agent fields, raw provider/model options, plugins, and transport-only auth.                                                               |
| `G11-CT-002` | The immutable row carries exact Gate 9 attribution/versions and a Gate 10 source-read receipt; overlapping roots fail without exact provenance; producer input has no mutable staging pathname. The later `G11-CT-010` correction preserves that receipt without retroactive active-root revalidation. |
| `G11-CT-003` | `readHistorical` and version-revalidated `readForCurrentUse` are separate operations; current teaching mechanically requires the exact current Revision or active old/current grant.                                                                                                                   |
| `G11-CT-004` | Automatic acceptance rejects only machine-observable failure states and records structurally valid model output as a model-claimed rendition, including the possibility of summary-like/refusal-like prose.                                                                                            |
| `G11-CT-005` | A typed allowlisted provenance/diagnostic schema replaces raw effective options/metadata; canary-secret evidence covers success and every provider/auth failure surface.                                                                                                                               |
| `G11-CT-006` | Complete-object integrity-scan ceilings and returned-content byte/record budgets have independent semantics and failure oracles.                                                                                                                                                                       |
| `G11-CT-007` | Failed deletion commit/restart has an explicit matrix for absent, exact, unexpected, unreadable, and committed targets, including `integrity_mismatch` without deleting foreign bytes.                                                                                                                 |
| `G11-CT-008` | Closing evidence requires an offline packaged-executable/hidden-child smoke, process-tree cleanup, packaged PDF.js assets, and license notices for every claimed release family.                                                                                                                       |

Second-round finding disposition from the retained reviewer:

| Finding      | Closed repair in the reviewed horizon                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `G11-CT-009` | Conversion admission/acceptance, continued-use grant issuance, and `readForCurrentUse` require current Gate 9 ordinary-use eligibility (`withdrawalReason` absent and `correctionHidden` false) with exact disposition-version revalidation. Historical access is exempt; withdrawal suspends rather than rewrites a grant, and ordinary restoration revives it only when the exact Artifact/Revision/AttributionBasis/lineage/grant basis remains unchanged. |
| `G11-CT-010` | Gate 10 root/binding/grant state is checked at stable-read admission and retained as an immutable disclosure receipt. Later revoke/rebind blocks new reads and requests cancellation; cancellation or acceptance may win, and final acceptance revalidates Gate 9 rather than requiring the old root episode to remain active.                                                                                                                                |
| `G11-CT-011` | The PDF child receives no output path and emits one bounded framed stdout payload captured in a parent-owned buffer. Validation and hashing cover that same buffer; publication occurs afterward and holds a verified stable object identity across the short database commit, with replacement-race evidence.                                                                                                                                                |

Final finding disposition from the retained reviewer:

| Finding      | Closed repair in the reviewed horizon                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `G11-CT-012` | Gate 9 sourceVersion remains in the immutable source proof and as the exact Gate 9 observation-transition precondition, but it is removed from final Representation acceptance, drift-grant identity/eligibility, current-use admission, and semantic retry conflict. Those boundaries instead revalidate effective Artifact, ordinary disposition/version, exact current Revision, AttributionBasis, lineage version, Representation availability, and active grant/version. Same-Revision missing/restored availability changes therefore neither revoke a grant nor retroactively defeat an exact completed conversion. |

Closed implementation/evidence findings from the retained reviewer:

| Finding      | Accepted repair and causal evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `G11-IE-001` | The migration runner now owns an explicit, opt-in `rebuild_graph` foreign-key mode. It disables enforcement before the one-migration transaction, keeps schema rebuild, journal, `user_version`, integrity check, and `foreign_key_check` in that transaction, then restores and verifies enforcement on success or failure. Gate 11 no longer relies on ineffective in-transaction PRAGMAs. The upgrade trace starts with `foreign_keys=1`, a settled invocation/receipt, and a populated active ContentRoot root/binding/binding-episode/grant/current graph; all rows and references survive and fresh/upgrade schemas remain equal. A separately injected graph-rebuild failure proves DDL, journal, and version rollback plus `foreign_keys=1` restoration.                                                                                     |
| `G11-IE-002` | Generic `AppProcess` timeout is now a typed cause that still returns only after the scoped process tree finalizer. The PDF adapter preserves `cancelled` and `timed_out`; conversion maps closed local/model failures to `cancelled`, `producer_timeout`, `invalid_producer_output`, `producer_failed`, `input_mismatch`, or `producer_unavailable`, and the runtime maps ContentRoot byte-budget failure to `source_too_large`. Composed tests cover root-revocation cancellation during a live producer, and Gate 8 runtime tests durably settle caller cancellation, typed timeout, invalid framed output, and ordinary producer failure without a Representation or receipt; exact retry returns the stored timeout result. Process-tree tests independently prove interruption and typed timeout await descendant cleanup.                                                                      |
| `G11-IE-003` | The old retained binaries were replaced by the exact refreshed two-family build recorded above. Build smoke now copies each complete `bin` tree outside the checkout and runs it with a closed environment/PATH. Direct deterministic-profile checks remain supplemental. The acceptance oracle starts the compiled main's hidden cancellation command, observes one exact sibling `repa-pdf-worker.exe` with the main PID as parent, sends only a control record to compiled-main stdin, and requires a clean parent result after the real `AppProcess` cancellation/finalizer removes the observed worker; the harness never directly kills the worker. Both current x64 and baseline passed, packaged assets/notices were checked, and no worker remained.                                                                                                                           |

Roadmap 09 changed during the failed implementation pass, so that pass was
stale. The accepted closure pass used roadmap hash
`8359c89fe4f24c0d3eef8644bbfab71a256fc9ff9d06c7c5d31cb4f5073a8703`;
the reviewer confirmed its Gate 11 row, Gate 12/13 boundary, and numbering are
unchanged. It did not broaden this Gate.

The independent reviewer supplied both required review-layer closures; no
same-context preflight or child review substitutes for those results. The
maintainer separately authorized integration. Commit `bdbfa0c05` fixes
implementation provenance, and `docs/README.md` formally closes Gate 11 without
starting Gate 12.
