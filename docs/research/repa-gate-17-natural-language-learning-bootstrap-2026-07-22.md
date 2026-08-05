# Repa Gate 17: natural-language learning bootstrap

Status: Gate 17 is closed at exact accepted implementation/evidence commit
`39a8c2f4`. Original fresh separate contract reviewer Dispatch
`ctx_475d85cda99f` accepted exact contract commit
`cf0cfbd032273cf7360fe7747ef0809abda6181f`; original fresh implementation
reviewer task `019fc311-9714-7eb3-a5f7-045ecf66a1a7` later closed
`G17-IE-001..005` and accepted the complete implementation/evidence candidate.
Mainline includes it through closure/status commit `506b420cf`. The
maintainer's baseline decision continues to omit built-in `/learn`. Current
volatile status and the Gate 18 control point are owned by
[the documentation map](../README.md).
Gate 14's Agent-native default-Course implementation is integrated at
`ff0ef1fd7`, and Gate 16's Agent-native Goal implementation is integrated at
`2baba9eea`. The ordinary interactive Agent is the sole baseline
open-language bootstrap entry.

Initial fresh separate top-level contract/theory review returned F1/F2. Those
semantic findings are closed on repair commit `2d890df5`; first closure by the
original reviewer required the review status to be made truthful, and status
repair commit `cf0cfbd0` supplied that correction without changing the
contract semantics. Final closure accepted that exact commit. The contract
derives only the missing durable
Course/View/material composition reached through the ordinary Agent, not
another natural-language subsystem. Downstream Gate 21A retains
representative move-selection and failure-re-entry evidence while beginning
with the ordinary Agent rather than a preselected mechanism comparison.

Date: 2026-07-22; accepted contract derived 2026-08-02

Authority:
[product origin](../foundation/00-product-origin.md),
[ADR-0012](../decisions/0012-learning-centered-modular-monolith.md),
[system architecture](../architecture/00-system-architecture.md),
[native learning data model](../architecture/01-native-learning-data-model.md),
and [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Primary predecessors:
[Gate 7 Course and Course View authority](opencode-fork-gate-07-course-view-authority-2026-07-15.md),
[Gate 8 learning-command settlement](opencode-fork-gate-08-learning-command-settlement-2026-07-16.md),
[Gate 9 source and Artifact authority](opencode-fork-gate-09-source-artifact-authority-2026-07-16.md),
[Gate 10 ContentRoot authority](opencode-fork-gate-10-content-root-authority-2026-07-17.md),
[Gate 11 readable Representation lineage](opencode-fork-gate-11-readable-representation-lineage-2026-07-17.md),
[Gate 12 durable Turn lifecycle](opencode-fork-gate-12-durable-turn-lifecycle-2026-07-18.md),
[Gate 13 Material Map and Course alignment](opencode-fork-gate-13-material-map-alignment-2026-07-19.md),
and [Gate 14 learner navigation continuity](opencode-fork-gate-14-learner-navigation-continuity-2026-07-19.md)

Successor boundary: Gate 18 owns bounded learning-context projection and
fresh/resumed Session continuation. When a bootstrap request means continuing
an existing Course, Gate 17 must not misclassify it as Course creation; Gate 18
owns its complete bounded context reconstruction and presentation. Gate 17
must work without a Goal or LearningSpace and does not claim later learner
adaptation, future attention, planning, terminal inspection, or the integrated
product loop. Gate 21A later owns representative cross-domain move selection
and re-entry evidence for the ordinary Agent; Gate 18 context visibility alone
does not prove that behavior.

## Why this Gate exists

The predecessor Gates established independent Course, Artifact,
Representation, Material Map, command-settlement, and durable-Turn
authorities. Their trusted application capabilities do not yet let the ordinary
released-v1 Agent create or revise only the Course state currently needed,
explicitly adopt and align local material when asked, and continue into useful
teaching through typed domain commands.

Gate 17 owns that durable bootstrap composition, not natural-language
interpretation itself. A fresh LearnerHome must be able to begin sustained
learning with or without local material, commit only the domain state actually
authorized, preserve every domain's identity, correction, and failure
semantics, and explain or demonstrate in the same Turn. A direct question may
remain a valuable zero-write interaction. Generic read, search, attachment, or
discovery does not silently admit learning state.

The inherited released-v1 harness already reconstructs one Session's model
history from durable typed Message/Part state, supports explicit continuation
of the latest or an exact Session, and compacts an older head into continuation
context plus a recent verbatim tail while retaining the original transcript.
Repa also binds an exact retained-steering cut to each interactive model
operation. That is not yet a complete learning-context reconstruction
mechanism: Course, working route, route anchor, Goal, Artifact, Representation,
and Material Map authorities are not yet composed into the bounded current
learning view for fresh and resumed Sessions. Gate 18 owns that observer and
projection boundary.

## Maintainer decisions and audit disposition

### Bootstrap uses the ordinary Agent and remains intent-scoped

The historical 2026-07-22 decision required every Gate 17 durable bootstrap to
begin with `/learn`. The 2026-07-27 first-principles audit reopened that
requirement, the 2026-07-30 maintainer correction established ordinary natural
language through the interactive Agent as primary, and the 2026-08-02
maintainer decision now omits `/learn` from the baseline entirely. A prefix
proves only that syntax was used; it does not decide new versus continue,
distinguish a macro activity, resolve interruption, or authorize an owning
domain transition.

Repa therefore registers no built-in `/learn` command, reserves no privileged
`learn` command-envelope identity, and gives no configured, plugin, skill, or
MCP command with that spelling bootstrap authority. If a separately configured
command expands to ordinary prompt text, that text has only the same
non-authoritative status as any other prompt input. Omission is a baseline
choice, not a permanent product prohibition: a future shortcut would require
new evidence, its own accepted boundary, and no weakening of the ordinary
Agent path.

No required `new | route | resume` subcommand grammar is justified. The
ordinary Agent may resolve a deliberate request to one or more separately
owned effects:

- create a distinct stable Course only when the learner means to begin a
  sustained endeavor separate from existing Courses;
- continue one exact existing Course without treating similarity of title or
  topic as identity, with complete fresh/resumed context presentation deferred
  to Gate 18;
- refine the same route strategy as a new View revision or form a materially
  different strategy as another View; or
- teach, explain, demonstrate, or explore with no durable Course/View write.

Separate semantic ownership does not mechanically choose a transaction
boundary. One explicit bounded local application operation may validate,
authorize, and atomically commit several named owner consequences. External or
long-running work, consequences that cannot be known or authorized together,
and later choices that depend on an earlier result must instead settle in
stages with refreshed context and truthful partial receipts.

Those are internal settlement distinctions, not user-visible modes. The Agent
uses bounded Course-owner reads when an existing target matters. If materially
different interpretations remain, the Tutor clarifies without a bootstrap
write; otherwise it may make a transparent reversible choice without exposing
internal IDs. The runtime validates the chosen exact owner state but does not
prove language meaning from exhaustive candidate coverage.

Creating a Course does not imply creating a whole route. A Course may remain
valid with no View. A coarse View is formed only when it helps the current
teaching move or supplies useful broad orientation; its local structure is
opened and refined as later moves or adopted material require it. A complete
course outline is authored only when the learner requests that artifact or a
current decision genuinely depends on its breadth. Working selection changes
only when the admitted request authorizes it.

Any ordinary learning statement is eligible for teaching, transient
discussion, or an authorized bootstrap effect according to the ordinary
Agent's interpretation and the available typed commands. Explicit material
adoption remains governed by the Artifact owner's rules; natural-language
understanding never silently admits every file mentioned or read.

Decision ID `G17-BS-001`. Provenance: maintainer, 2026-07-22; reopened by the
2026-07-27 first-principles audit; ordinary-Agent direction corrected by the
maintainer on 2026-07-30; optional shortcut omitted by the maintainer on
2026-08-02. The counterexample is a semantically exact ordinary request being
denied while a vague `/learn explain X` still authorizes no write. The
rejection of a literal `new | route | resume` grammar and eager whole-route
construction remains sound.

### Provisional is derived from exact provenance, not a lifecycle

A model-authored coarse working route remains visibly provisional and
correctable, but Gate 17 does not add a mutable
`provisional -> reviewed -> verified` Course lifecycle, confidence score, or
promotion-to-truth transition.

The learner-visible interpretation is derived from exact owned facts:

- Course working selection means only that one exact eligible revision is the
  current broad navigation route;
- revision authorship and the admitted learner occurrence record who supplied
  or directed the route and the causal basis for the write;
- exact Material Map and neutral alignment records show which material ranges
  are associated with which exact Course memberships without claiming that the
  material teaches, requires, validates, or proves the route; and
- absent stronger owned facts remain visible as uncertainty rather than being
  compressed into a verification label.

Correcting or improving a route creates a successor Course View revision with
the accepted preserve/split/merge item mapping and retains the predecessor as
provenance. It does not promote the old or new route into objective curriculum
truth.

This decision keeps a richer review or grounding authority consumer-earned. A
later contract may add one only after a concrete Tutor, planning, or inspection
behavior needs a distinction that exact authorship, causal source, material
relations, and revision history cannot preserve honestly.

Decision authority: maintainer, 2026-07-22. It may be revised by the maintainer
or by an accepted product/architecture correction prompted by a demonstrated
consumer that cannot recover the needed distinction from existing provenance.

## Resolved admission boundary

General input delivery, Session creation/fork/resume, macro activity
continuation, and detour/rejoin are not Gate 17 decisions. Earlier draft
derivations that tried to settle them through Codex queue/steer vocabulary were
invalidated by maintainer correction and remain excluded.

The omitted shortcut also removes its conditional cross-carrier envelope cost.
The current
[TUI prompt](../../packages/tui/src/component/prompt/index.tsx),
[direct-run command](../../packages/opencode/src/cli/cmd/run.ts), and
[ACP service](../../packages/opencode/src/acp/service.ts) may continue expanding
generic configured commands before ordinary prompt admission. Gate 17 neither
uses that expansion as authority nor adds a trusted slash-envelope field to the
[prompt input](../../packages/opencode/src/session/prompt.ts). The
[command registry](../../packages/opencode/src/command/index.ts) may still
contain unrelated configured, skill, or MCP names; no spelling can bypass the
ordinary Agent, capability, owner-state, and settlement boundaries below.

## Accepted Gate 17 contract

This section is the complete accepted contract derived after the maintainer
grill. `G17-BS-001` above is an accepted maintainer decision. The remaining
`G17-BS-*` clauses are engineering derivations from current product,
architecture, and predecessor authority. Fresh separate top-level review
returned two accepted Gate 10 conflicts: the candidate had narrowed local-read
authority to ContentRoot and allowed more than one potentially mutating new
local Artifact target in one admitted model operation. The repaired,
status-corrected contract is accepted at exact Git commit
`cf0cfbd032273cf7360fe7747ef0809abda6181f`. Scoped implementation may proceed
against that binding; no implementation, migration, implementation evidence,
or integration is accepted by this contract review.

### Contract checksum

| ID | Boundary |
| --- | --- |
| `G17-BS-001` | Ordinary natural language through the interactive Agent is the sole baseline entry; Repa omits built-in `/learn`. |
| `G17-BS-002` | Thin exact owner reads plus one closed request-bound bootstrap change set expose semantic choices without a second interpreter or internal-ID learner protocol. |
| `G17-BS-003` | Every jointly knowable and authorizable local consequence in one bootstrap set commits atomically; external, long-running, or result-dependent work settles in separately receipted stages. |
| `G17-BS-004` | Course/View creation and correction preserve Gate 7 identity, authorship, revision, selection, and provenance semantics; a Course may remain without a View. |
| `G17-BS-005` | Material becomes durable only through explicit adoption and the applicable exact Gate 9/10/11/13 authority. Gate 17 preserves Gate 10's exact local-read union (an approved ContentRoot, the active execution workspace, or an exact one-operation learner grant), and one admitted model operation may commit at most one new Artifact mutation; read, search, attachment, or transient web research remains non-admitting. |
| `G17-BS-006` | Working selection and an exact route-anchor consequence may compose locally; default Course, Goal, steering, progress, mastery, and macro activity remain separately owned. |
| `G17-BS-007` | Gate 8 physical identity, one request-bound semantic slot, Agent issuance, configured capability policy, semantic-first replay, CAS, and crash recovery govern the command. |
| `G17-BS-008` | Durable typed receipts state only actual effects and stage truth; the ordinary Agent may then teach in the same Turn without turning prose into learning truth. |

### Learner-facing flow

The baseline flow is:

```text
ordinary learner request
-> ordinary Agent reads exact owner state only when useful
-> teach with no write, clarify one material learner-owned ambiguity,
   or issue one typed bootstrap change set
-> common capability policy and any exact source preparation
-> one short local commit or a truthful no-effect result
-> durable typed acknowledgement
-> useful explanation, demonstration, or guided work in the same Turn when possible
```

The learner does not choose an internal mode, enumerate candidate IDs, manage a
Course/View/Artifact transaction, or confirm a routine reversible write under
effective `allow`. The Agent may make a transparent reversible choice when the
conversation and owner reads are sufficient. It asks in ordinary learner
language only when materially different learner-owned meanings remain.

A direct question, explanation request, exploration, or transient research
request is a valid zero-write path. A new Course is not required merely because
the topic is new to the current Session, and similarity of title, folder,
material, or wording never makes an existing Course the same identity.

### Model-visible owner reads

Gate 17 exposes only the read reach needed to form an exact command:

- the current Course query gains bounded View, Revision, item-membership, and
  transition reads already owned by Gate 7;
- thin Artifact and Material Map queries expose exact current identity,
  revision/representation target, disposition, provenance, correction
  branches, and explicit cursor/omission truth needed for adoption or
  correction;
- Gate 10 remains the only boundary by which this Gate inspects a raw local path
  or prepares Gate 9 input: read authority comes only from an approved
  ContentRoot, the active execution workspace, or an exact one-operation
  learner grant, and Gate 10 binds the exact root-object/path scope; and
- exact current working selection and route-anchor state come from their
  existing owners.

These reads are reserved built-in capabilities whose default/restricted/
delegated visibility comes from the one authoritative capability catalog.
They create no learning-command candidate, permission request, durable query
snapshot, Artifact admission, Material Map use observation, frontier movement,
or proof that the Agent's interpretation was unique. A cursor or omitted page
is a tool fact, not a semantic authorization predicate.

The learner never has to type an opaque identity. The Agent may pass exact IDs
returned by tools to typed commands. If readable locators still collide, a
clarification may display the minimum stable discriminator needed to let the
learner choose.

### One closed bootstrap change set

Gate 17 introduces one versioned bootstrap write capability with semantic
address
`(admitted learner occurrence, learning-bootstrap slot)`. The actual public
tool spelling is an implementation detail; it is not `/learn`.

One change set targets exactly one Course, either an exact existing Course or
one new Course allocated by the Course owner. It may contain only this closed,
bounded composition:

1. create the Course or correct its mutable metadata against the exact current
   Course state;
2. publish at most one currently needed route strategy change: create one View
   with its first non-empty Revision, add one successor Revision to an existing
   View, or create one materially distinct View;
3. preserve, set, or clear that Course's exact working selection;
4. adopt a bounded explicit material set consisting of exact already admitted
   Artifact Revisions or accepted Representation Revisions plus at most one new
   local target whose Gate 10 preparation and Gate 9 admission/observation may
   mutate Artifact state;
5. optionally create bounded Material Map snapshots and neutral alignments for
   those exact material targets, with explicit predecessor references when a
   correction is claimed; and
6. preserve, set, or clear the target Course's route anchor.

Every arm is optional except identifying or creating the one target Course,
and the set must contain at least one requested state transition. A Course-only
creation is valid. A Course may still have no View, material, working
selection, or anchor. An all-current-state semantic request can settle as
typed no-effect, but the model may not send an empty administrative call merely
to obtain a receipt.

The model supplies semantic content and exact existing owner references only:
Course/View labels, the current route snapshot and transition mapping,
selection/anchor intent, explicit material adoption intent, exact material
targets, Map outline/selectors, neutral alignment reason, and correction
predecessors. Bounded runtime-local keys may refer among newly proposed View,
Revision, item, Map, and alignment records and at most one newly proposed
Artifact inside the set. The runtime maps those keys to program-generated
persistent IDs.

The model does not supply persistent IDs for new records, numeric owner
versions, timestamps, permission decisions, capability versions, Agent
issuance lineage, authorship/proof labels, source-observer identity, physical
invocation identity, receipt/effect IDs, or frontier state. Exact existing IDs
are protected references obtained from bounded owner reads, not learner-facing
syntax.

This is one domain-specific application command, not universal CRUD, a generic
command bus, a stored workflow, or authority to compose arbitrary future
owners. A request that genuinely needs several Course targets is clarified or
handled through later learner occurrences rather than several bootstrap calls
for one semantic slot. A later semantic choice that depends on an earlier
external or separately owned result is staged rather than widening this closed
union.

### Atomic local composition and truthful staging

The bootstrap application layer may coordinate several authorities because
Repa is one modular monolith with one SQLite transaction boundary. It does not
take their meaning. Each owner prepares and revalidates its own exact proof and
applies only its legal transition through a transaction-scoped trusted seam.
The composition layer never writes another owner's tables directly.

For a free, allowed candidate, filesystem reads, hashing, media inspection, and
other source preparation occur outside the database transaction through the
existing Gate 10/Gate 9 boundary. The bootstrap may reference a bounded set of
already admitted exact Artifact or Representation Revisions, but one
provider-visible admitted bootstrap operation may carry at most one new local
target whose Gate 9 admission or observation can mutate Artifact state. Gate 10
derives that target's read authority only from an approved ContentRoot, the
active execution workspace, or an exact one-operation learner grant and binds
the exact root-object/path scope while preparing Gate 9 input. The final short
uninterruptible transaction rechecks the semantic winner, Turn/tool frontier,
one-mutation model-operation slot, exact Course/View/selection/navigation
heads, the Gate 10 authorization snapshot and root-object/path binding,
Artifact state, Representation availability when used, Map/alignment
preconditions, and every owner proof. It then commits the at-most-one Artifact
mutation and every included Course/View/Map/alignment/selection/anchor
consequence with the Gate 8 effect/receipt, Tool settlement, typed
acknowledgement, commit seal, and learning-frontier advance, or commits none of
them.

No SQLite transaction remains open across model sampling, network access,
permission waiting, generic tool execution, filesystem conversion, or other
long-running work. Conversion to a readable Representation, downloading or
materializing a remote source, a separate permission grant, or any choice whose
meaning depends on an earlier result must settle first through its existing
owner. The Agent then refreshes exact context and may issue the bootstrap
against that committed result.

Multiple local targets whose admission or fresh observation could mutate
Artifact state never share one provider-visible bootstrap operation. Each must
first settle through a fresh admitted Gate 9 model operation with its own Gate
8 result. A later bootstrap may then reference their exact committed Artifact
Revisions or any separately accepted Gate 11 Representation Revisions while
preserving atomicity for its own Course/View/Map/alignment/selection/anchor
consequences.

Staging is truthful rather than compensating. If an earlier Representation or
other separately owned effect committed and the later bootstrap fails, the
earlier effect remains exactly committed and independently correctable; Gate
17 does not roll it back or claim an all-or-nothing workflow. Each attempted
stage has its own durable typed result. A stage never attempted has no invented
effect or workflow row; the Turn transcript and absence of a Tool invocation
remain the truth.

Within one bootstrap set, a no-change child is reported as no-change while
other real children may commit. If every child is no-change, the command
creates no domain effect, consumes no applied-mutation slot, and advances no
learning frontier. Any invalid, stale, unauthorized, over-limit, or
unavailable child rejects the entire local set; there is no partially created
Artifact mutation, Course, View, Map, alignment, selection, or anchor.

### Course and Course View semantics

Gate 7 remains the only owner of Course, View, Revision, item, mapping,
withdrawal, and working-selection legality:

- Course identity is generated and never inferred from title, subject,
  Session, directory, source, or payload hash;
- Course creation atomically establishes its nullable versioned working
  selection and does not create a placeholder View;
- a coarse View is published only when useful for the current teaching move or
  broad orientation; the command does not eagerly fabricate a full syllabus;
- refinement of one route strategy creates its exact next immutable Revision,
  while a materially different strategy creates a distinct View;
- item preservation, split, merge, addition, removal, and cross-View reuse use
  Gate 7's exact mapping/citation algebra and never retarget old references;
- correction preserves predecessor identity and provenance rather than
  rewriting a prior Revision; and
- selection pins one exact eligible Revision and never follows a later
  Revision automatically.

The model cannot write Gate 7's raw `authorship_basis`. The application command
has closed semantic arms for directly applying learner-supplied structure,
applying model-authored structure the learner requested, and publishing a
Tutor-initiated proposal. The trusted runtime maps those arms and exact causal
Agent action to Gate 7's existing `learner_authored`, `learner_directed`, or
`tutor_proposed` basis. That mapping records creation provenance, not objective
truth or linguistic proof.

A learner-directed route may become the working selection in the same atomic
set without another Gate-specific confirmation under effective `allow`. A
Tutor-initiated route remains an unselected candidate until a later learner
occurrence authorizes selection. Selection never rewrites authorship. Model
authorship remains visibly provisional through causal source and revision
history, not through a new confidence or verification lifecycle.

### Explicit material adoption and exact provenance

Material admission is narrower than material use in a transient answer. The
Agent may include a material arm only when the learner explicitly adopts,
retains, maps, or aligns the exact source for the Course. Reading an
attachment, searching a root, opening a file, quoting a web page, or deciding
that content looks useful does not supply that adoption.

For the at-most-one new local target, the model supplies one exact path request,
not authority. Gate 10 may authorize it only through its existing closed union:
an approved ContentRoot, the active execution workspace, or an exact
one-operation learner grant. Gate 10 names the applicable ContentRoot or exact
runtime scope, binds the exact root-object/path scope, and prepares Gate 9's
input. A raw absolute path, workspace launch, directory marker, or bootstrap
payload never grants wider access or turns a workspace or one-operation grant
into a ContentRoot. Trusted source preparation binds the canonical location,
race-safe exact descriptor, observation time, media determination, and Gate 9
admission basis. A missing, unreadable, escaped, or incompletely observed file
publishes no placeholder.

When the location is already admitted, the bootstrap normally references its
exact existing Artifact Revision instead of creating a duplicate. A requested
fresh observation that may mutate Artifact state consumes the same sole
Artifact-mutation arm; additional potentially mutating observations first
settle through fresh admitted Gate 9 model operations. A concurrent fresh-
admission race fails stale and reloads rather than merging identities.

The bootstrap may reference a bounded set of exact already admitted Artifact
Revisions and accepted Representation Revisions when readable derived bytes are
required. It does not perform Representation conversion inside the local
transaction. Conversion and any durable generated bytes settle through Gate 11
first.

A Material Map is optional. An adopted Artifact may remain unaligned, several
Maps may coexist, and every Map binds one exact Artifact or Representation
Revision. An alignment is optional, neutral, and references exact Map selector
and Course View Revision membership. It does not claim prerequisite,
correctness, completeness, progress, mastery, or that material order is the
Course route. Map or alignment correction creates an explicit successor and
preserves old endpoints; withdrawal/restoration never retargets history.

Transient web research remains model/Tutor context only. Gate 17 introduces no
remote Artifact connector or hidden snapshot admission. A web result may enter
the durable material path only after a separately authorized mechanism has
materialized and admitted an exact source under existing owner rules; the
bootstrap then references that exact durable identity.

### Working selection, route anchor, and separate owner effects

The target Course's working selection may compose because it is a Course-owned
consequence of the same exact View decision. An optional route-anchor
consequence may also compose when the request warrants an exact starting or
resume item:

- `preserve` leaves the durable anchor untouched; a changed working Revision
  may therefore make it truthfully stale;
- `set` must name exact membership in the final eligible working Revision,
  including a runtime-local item created by the same set; and
- `clear` uses the exact current navigation head and remains legal under Gate
  14's current rules.

The final receipt reports no anchor, usable anchor, cleared anchor, or exact
stale reason. A preserved item ID, split/merge relation, neighboring item,
first item, or completed explanation never retargets or advances the anchor.
Teaching completion creates no ordinal progress, mastery, or evidence.

Default Course preference is not an automatic bootstrap consequence. Goal,
retained steering, ContentRoot approval, Representation conversion, and other
owners also retain their own typed commands, semantic slots, capability
policy, receipts, and correction paths. If one learner request explicitly asks
for those effects too, the Agent stages them with refreshed context and
truthful per-command outcomes. Gate 17 does not absorb them merely to make the
Turn appear atomic.

LearningSpace identity, Session topology, queue/steer delivery, macro activity,
detour/rejoin, context projection, learner adaptation, future attention,
Assignment, and planning remain outside this Gate.

### Admission, capability, replay, and conflict

The command reuses Gate 8's separation of physical invocation and semantic
effect:

1. exact physical replay returns its stored result; physical identity reuse
   with a different trusted envelope or canonical change set conflicts;
2. a physically new authentic invocation computes the semantic address and
   canonical fingerprint without reading live Course, source, material, or
   capability state;
3. an address with a committed semantic winner settles the new physical
   invocation as already-applied or semantic conflict before source I/O,
   cancellation, delegated membership, or capability policy; an exact physical
   replay of a prior no-effect outcome was already settled by step 1;
4. only a free address evaluates the exact root or delegated bootstrap-write
   membership; an authentic invocation without that membership receives a
   truthful pre-admission no-effect denial, while a valid issuer atomically
   admits the candidate, Agent-issuance provenance, runtime-bound owner
   snapshots, and command state; and
5. the admitted candidate uses the common capability lifecycle: effective
   `deny` creates no effect, effective `allow` adds no Gate-specific prompt,
   and effective `ask` shows the exact complete bound operation through the
   ordinary permission surface.

The canonical fingerprint includes the complete closed semantic change set,
exact protected existing identities and predecessor references, runtime-local
key graph, proposed Course/View/Map content, selection/anchor intent, explicit
material adoption, and alignment meaning. It excludes generated persistent
IDs, physical/tool/model-operation identity, root-versus-delegated issuance,
numeric live versions, timestamps, capability policy/outcome, permission
request/reply, and runtime-observed source descriptors. Changing semantic
meaning at the same address conflicts; changing only the worker or retry route
does not.

The runtime binds the exact issuing root or child model operation, admitted
learner occurrence, delegated capability lineage, current owner heads,
trusted clock, source preparation authority, permission outcome, and generated
identities. These facts establish legal issuance and settlement, not proof
that the model's natural-language interpretation was objectively entailed.

After effective authorization and any bounded source preparation, final
settlement rechecks semantic replay/conflict first and then every current
precondition in the one local transaction described above. A candidate that
loses the semantic address during permission wait or recovery preserves its
truthful issuance/capability history, returns the winning duplicate/conflict,
and creates no losing effect.

Learner correction, rejection, or cancellation observed before the final local
transaction begins prevents the old candidate from applying. Once that short
uninterruptible transaction begins, its exact outcome wins. If it commits, the
correction is a new learner occurrence and new legal transition; the runtime
returns the committed receipt instead of pretending cancellation erased
durable state.

### Persistence, migration, and recovery

Implementation requires a generated forward migration from the current Gate 16
database and the same schema in a fresh installation. The schema must add a
closed bootstrap disposition, semantic candidate/terminal state, effect and
child-consequence projection, exact Agent issuance and capability facts,
immutable receipt/acknowledgement, and commit seal. Production code adds only
the minimum owner-private transaction seams needed for composition. Existing
Course, Artifact, Representation, Map, navigation, command, Session, and Turn
history remains byte-truthful; no historical row is relabelled as a Gate 17
command.

Database constraints own structural shape, exact references, one semantic
winner, effect/receipt/commit-seal correspondence, and legal nullable arms.
They do not parse natural language, infer explicit adoption, decide
authorship, validate filesystem bytes, or duplicate complete domain
transition semantics in triggers.

No background worker, recovery queue, provider replay, or durable workflow is
added. A crash before final commit leaves no bootstrap domain effect; startup
settles or reconciles the admitted candidate to its exact no-effect outcome
without rerunning model or external work. A crash after commit recovers the
complete effect and immutable receipt. If the database cannot determine
whether the uninterruptible commit won, the runtime reports outcome unknown
until exact reconciliation; it never claims no effect while durable rows may
exist.

Session deletion or compaction does not delete Course/material truth. Existing
source and invocation tombstone behavior preserves provenance. Recovery always
consults durable database truth rather than reconstructing a command from
Assistant prose.

### Durable terminal truth and same-Turn teaching

Every applied bootstrap and every physically new already-applied replay
produces one concise durable typed ToolPart visible in the primary TUI and
semantically equivalent in direct-run and ACP. It states only committed facts:

- exact Course and any View/Revision identities with readable labels;
- which local children changed or were no-change;
- selected Revision and route-anchor result, including exact staleness;
- each adopted Artifact/Revision or Representation, optional Map/alignment,
  observation/provenance meaning, and any separately staged prerequisite;
- Agent-authored versus learner-supplied/requested route provenance and its
  correctable, non-verified meaning; and
- the owning correction path without requiring the learner to copy an ID.

Denied, cancelled, stale, invalid, conflicted, failed, interrupted, and unknown
outcomes show their exact no-effect or uncertainty state and never render
proposed IDs as committed. A separately committed preparation followed by a
failed bootstrap remains visible as two truthful results, not a fabricated
partial bootstrap effect. The bootstrap receipt does not claim that an absent
later stage was attempted.

After the Tool result, the ordinary Agent may immediately explain,
demonstrate, ask a useful learning question, or begin guided work using the
actual committed result in the same durable Turn. This is required for the
ordinary baseline `allow` path and remains best-effort across explicit
permission pauses, provider failure, or learner interruption. Assistant prose
does not become Course, material, progress, mastery, or learner-record truth
unless another accepted typed command commits that meaning.

Gate 22 still owns general inspection and correction composition. Gate 17 owns
only the receipt needed to avoid hiding or misreporting its own write.

### Failure matrix

| Pressure | Required result |
| --- | --- |
| Direct teaching, vague adoption, or materially different Course meanings | Teach or clarify in ordinary conversation; no bootstrap write. |
| Same physical invocation | Exact stored replay; mismatched envelope or semantic input conflicts. |
| Same semantic address and same committed meaning | Already-applied before live-state, I/O, or permission checks; an exact physical replay of a prior no-effect returns that stored no-effect. |
| Same semantic address and different meaning | Semantic conflict; no candidate effect or fabricated current locator. |
| Missing/delegated-without capability, deny, rejected ask, or cancellation/correction observed before the final transaction begins | Truthful no-effect; no local child transition. |
| Stale Course/View/selection/anchor, revoked or expired Gate 10 authority, changed root-object/path binding, changed Artifact/Representation/Map state, invalid mapping/selector/alignment, or over-limit bundle | Entire local bootstrap rolls back. |
| Missing/unreadable/escaping local file or source mutation outside Gate 10's exact observation contract | No placeholder Artifact and no bootstrap effect. |
| More than one new or freshly observed local target could mutate Artifact state | Reject or decompose before effect; each target settles through a fresh admitted Gate 9 model operation, and only a later bootstrap may reference all exact committed Artifact Revisions or separately accepted Representation Revisions. |
| Representation conversion or another separately owned preparation commits, then bootstrap fails | Preparation remains committed with its own receipt; bootstrap reports no effect. |
| Mixed changed and no-change local children | Changed children co-commit; no-change children are named without fake versions or effects. |
| All local children no-change | Visible no-effect; no mutation-slot use or frontier advance. |
| Crash/abort before final commit | Recovery settles exact interruption/no-effect without re-running model or external work. |
| Crash after final commit or cancellation racing an already committed transaction | Exact committed receipt wins; no false cancellation. |
| Provider failure after a committed Tool result | Durable bootstrap remains committed and visible; failed teaching text does not roll it back or imply learning progress. |

### Implementation ownership and dependency direction

Gate 17 belongs at the application composition seam between the retained Agent
runtime/Gate 8 settlement and existing Core learning authorities. Core owners
remain independent of the AI SDK, provider, terminal, and prompt language.
The application layer may sequence preparation and open the one final database
transaction, but Course, Artifact, Representation, Material Map, and navigation
modules each validate and apply their own invariants through narrow
transaction-scoped functions.

Implementation must not add a generic manager, service/repository abstraction,
controller framework, command bus, universal effect table, cross-domain CRUD
schema, fixed planner/implementer workflow, or second natural-language parser.
It may refactor a current owner entrypoint into reusable prepare/revalidate/apply
pieces only where the bootstrap transaction genuinely needs the same accepted
invariant. The public standalone owner operation and the composite path must
share that invariant rather than duplicate it.

The ordinary released-v1 Agent loop, typed Message/Part history, provider,
permission, MCP, subagent, compaction, cancellation, and recovery mechanics
remain the execution spine. Exact table/column names, tool spelling, prompt
wording, module placement, test counts, and commit slices are later
implementation details constrained by this contract.

### Fixed non-implications

Gate 17 does not establish:

- a slash-command product surface or reserved `learn` namespace;
- a fixed parser, keyword classifier, exhaustive candidate proof, second model
  call, or deterministic semantic resolver;
- a mandatory Course/View/material write for useful teaching;
- a complete syllabus, Course lifecycle, verified curriculum, confidence
  score, or promotion-to-truth state;
- automatic default Course, route advancement, progress, mastery, evidence,
  Goal, Assignment, plan, steering, or learner adaptation;
- a universal transaction across provider, network, filesystem conversion, or
  separately authorized domain effects;
- hidden admission from attachments, generic file tools, root approval,
  search, web research, or Tutor enthusiasm;
- an implicit union or widening of Gate 10 local-read authorities, raw-path
  authority, or more than one new Artifact mutation in one admitted model
  operation;
- a remote-source connector, RAG/indexing system, LearningSpace owner,
  Session/macro activity, context projection, or complete product loop; or
- release readiness, performance qualification, pedagogical efficacy, or
  closure of Gates 18 through 23.

## Closing evidence required

### Deterministic authority and migration evidence

- a frozen current Gate 16 database upgrades forward and a fresh database
  agrees on the Gate 17 schema, constraints, triggers, reserved capability
  identifiers, and exact historical replay;
- Course, Artifact, Representation, Map/alignment, navigation, Gate 8,
  Session/Turn, and frontier rows satisfy one-effect/receipt/commit-seal
  correspondence with no cross-owner dangling or multiply owned consequence;
- model payloads cannot set generated IDs, versions, timestamps, capability,
  permission, observer, authorship/proof, issuance, or frontier facts; and
- owner-private transaction seams are shared by standalone and composite paths
  and no composition code writes owner tables directly.

### Read, capability, and semantic-settlement evidence

- default, restricted, and delegated Agents receive exactly the catalog
  intersection for Course/material reads and bootstrap write; omitted or newly
  registered capabilities do not inherit wildcard access;
- built-in IDs reject custom/plugin/MCP collision while no built-in `/learn` or
  privileged `learn` envelope exists;
- every new read is bounded, cursor-scoped, omission-truthful, and zero-write,
  including no Material Map current-use observation from a pure query;
- reads authorized by an approved ContentRoot, the active execution workspace,
  or an exact one-operation learner grant each bind the exact Gate 10
  root-object/path scope and prepare identical Gate 9 input without implicit
  authority union or widening;
- physical replay, same-address duplicate/conflict, root/delegated/missing
  capability, allow/ask/deny, permission correction, cancellation, one-mutation
  races, stale owner snapshots, and semantic-wait losers obey the ordering
  above; and
- fault injection covers candidate admission, durable ask issue/reply,
  source-preparation boundaries, every local child application boundary,
  commit-seal publication, terminal ToolPart publication, live abort, and
  startup recovery.

### Course, material, navigation, and composition evidence

- fresh Course creation with no View remains valid; coarse learner-directed
  creation, Tutor-proposed unselected route, selected exact Revision, route
  correction, materially different View, mapping algebra, and no automatic
  selection movement preserve Gate 7 meaning;
- explicit local adoption covers a fresh file, an already admitted same path,
  same-path new bytes, exact old Revision use, unavailable/withdrawn source,
  Representation target, optional unaligned Artifact, optional Map, neutral
  many-to-many alignment, successor correction, and source/Map/Course races;
- transient web research, attachment, read, search, and root approval create no
  Artifact, Map, alignment, Course relation, or hidden current-use observation;
- one jointly knowable local bundle with a bounded set of already admitted
  exact Artifact/Representation Revisions and at most one potentially mutating
  new local target commits its Artifact/Course/View/Map/alignment/selection/
  anchor children or none; attempts with multiple potentially mutating new
  local targets reject or stage through fresh admitted Gate 9 model operations,
  after which a later bootstrap may reference every exact committed Revision;
- a separately committed Artifact admission or conversion followed by
  bootstrap failure remains visibly partial rather than rolled back or
  misreported;
- preserve/set/clear/no-anchor/stale-anchor cases hold without ordinal
  advancement, mapped retarget, progress, mastery, or default-Course mutation;
  and
- provider failure, database failure, source mutation, permission wait,
  learner correction, cancellation, crash, restart, and exact retry cannot
  fabricate or duplicate any child effect.

### Product-path qualification

Bounded released-v1 real-model traces must use the production ordinary Agent,
not a language benchmark or a special test parser, to cover:

- fresh natural requests with and without explicitly adopted local material;
- create versus exact continue, same-route revision versus distinct View,
  teach-only, a transparent reversible choice, and one genuinely material
  ambiguity;
- same-Turn explanation or demonstration after an applied/no-change receipt
  and truthful continuation after a failed or separately staged result;
- learner correction before the final transaction begins and after commit,
  preserving old provenance and following only the new accepted route; and
- primary TUI behavior plus semantically equivalent direct-run and ACP typed
  results, with no internal-ID/state-management Turn and no `/learn` dependency.

Deterministic evidence proves identity, legality, replay, transaction,
permission, migration, and recovery. The bounded model traces qualify only
that the ordinary Agent can use the exact reads and typed command in
representative language situations. They do not prove exhaustive language
coverage, objective interpretation, educational efficacy, or the later
integrated product loop.

## Independent contract-review closure

Initial fresh separate top-level reviewer Dispatch `ctx_c8328a7778c0` reviewed
exact candidate `2c2b1be0cb37d6196efe9c9e63313a47214f6263` and returned F1/F2.
F1 identified the narrowed Gate 10 local-read authority; F2 identified the
breach of Gate 10's one-new-Artifact-mutation ceiling. Semantic repair commit
`2d890df54a342590d36172c80c8aab1e56da85e3` restored the full exact local-read
union and limited each admitted model operation to at most one new Artifact
mutation without changing the accepted composition or owner boundaries.

Original-reviewer closure Dispatch `ctx_b5ec7c6d7169` confirmed the semantic
repair but required the current review status to stop claiming that the
candidate had not entered review. Status repair commit
`cf0cfbd032273cf7360fe7747ef0809abda6181f` made that provenance truthful
without changing any contract clause. The same original reviewer then returned
final exact-binding `Accept` in Dispatch `ctx_475d85cda99f`, explicitly
accepting `cf0cfbd032273cf7360fe7747ef0809abda6181f` with no remaining finding.

That exact acceptance made scoped Gate 17 implementation authority available.
It accepted no Gate 17 implementation, implementation evidence, or integration.

## Implementation/evidence closure locator

The 2026-08-02 top-level executor prepared the scoped candidate recorded in
[the Gate 17 implementation/evidence record](repa-gate-17-natural-language-learning-bootstrap-implementation-evidence-2026-08-02.md)
against exact base `822f8a3df4baa5b51002e7ffd8118a01d567c2a0` and this exact
accepted contract. Original fresh reviewer task
`019fc311-9714-7eb3-a5f7-045ecf66a1a7` closed `G17-IE-001..005` and accepted
exact implementation/evidence commit `39a8c2f4`; mainline includes it through
closure/status commit `506b420cf`. This status correction changes no Gate 17
contract clause. The current control point remains owned by
[the documentation map](../README.md).
