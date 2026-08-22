# Repa Gates 5/8/12/18 bounded correction: learner-chosen Session deletion

Status: **contract/theory and exact current implementation/evidence successor
accepted and integrated with Gate 22 at implementation commit
`ada0a04c19847ce62ae490c90838c88c51a65d72`**

Date: 2026-08-13

Current correction notice (2026-08-22): Gate 22 review finding `G22-CR-002`
proved that several registered material read outputs did not match their exact-
read projector. The deletion/restore contract, audit allowlist, and every other
accepted invariant remain unchanged. The action-complete version-2 producer
correction and focused minimal-audit evidence are recorded in the implementation
evidence successor. The retained reviewer accepted exact 90-path package
manifest `334CDCAEEA573A8257E8F3B67A8A4AE9550F06522B3E85645B974CE126C4CBE6`
and restored the current implementation/evidence claim.

Derivation baseline: `main`/`origin/main` commit
`b8100d1c17cd31ec713062c8a1ca5254208899ec`, plus the maintainer's 2026-08-13
product decision recorded in the current
[product origin](../foundation/00-product-origin.md),
[system architecture](../architecture/00-system-architecture.md),
[native learning data model](../architecture/01-native-learning-data-model.md),
and [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md).

This candidate corrects only the Session-deletion/retention and local-restore
seam shared by:

- [Gate 5 inherited product-surface disposition](opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md),
  which owns the retained local-JSON offline export/import capability and its
  former same-database, same-identity restore evidence;
- [Gate 8 learning-command settlement](opencode-fork-gate-08-learning-command-settlement-2026-07-16.md),
  which owns the atomic deletion transaction around surviving command effects,
  receipts, and source-unavailable occurrence tombstones;
- [Gate 12 durable Turn lifecycle](opencode-fork-gate-12-durable-turn-lifecycle-2026-07-18.md),
  which owns Interaction membership, terminal truth, and minimal referenced
  unavailable-source receipts; and
- [Gate 18 learning context and Session continuation](repa-gate-18-learning-context-session-continuation-2026-08-03.md),
  which owns immutable Context cuts and their deletion behavior.

Every other accepted Gate 5, Gate 8, Gate 12, and Gate 18 invariant remains
accepted at its recorded boundary. The current working tree now contains a
separate
[accepted implementation/evidence record](repa-gate-05-08-12-18-session-deletion-choice-correction-implementation-evidence-2026-08-14.md)
for this correction. Retained reviewer
`019ff945-7b10-7f53-999f-b92dfa68d30c` accepted the exact 90-path package
manifest
`C18F06F7D10DD2C183AAD13036EA772B3D28DFE976DC4D852CEEF898D7C93474`
after closing `G81218-IR-001..003`. That accepted predecessor is now subsumed
by the integrated Gate 22 successor.

## Maintainer-owned product decision

Deleting a Session is an explicit learner choice between two behaviors:

1. **Delete all Session inspection lineage.** Delete the conversation and other
   Session-owned bodies, every Context cut, and the Context/read/citation/action
   associations that a later inspection could use. Surviving independently
   owned learning records may still report their source as deleted,
   unavailable, or unknown through their existing body-free receipts, but Repa
   cannot reconstruct or claim the deleted Session lineage.
2. **Delete bodies and retain a minimal structured audit.** Delete the same
   bodies, but retain only the allowlisted body-free facts in this contract so
   a later inspection can report limited operational lineage. The learner may
   later delete this audit and reach the first state.

Neither behavior provides per-record causal attribution for a Tutor answer.
The product may report operational facts—Context inclusion, exact read, typed
citation, and operation terminal state—but never turn them into a claim that a
particular record caused, governed, or changed model-authored prose.

Decision ID `SESSION-DELETE-CHOICE-001`.

### Deletion finality and offline backup

The maintainer resolved `G81218-CR-009` on 2026-08-13: an applied Session
deletion is final for that root Session address within the same local
LearnerHome/database. A separately exported local JSON file is outside the
database deletion scope, but importing it may not revive the deleted Session,
reuse its Session/Message/Part identities, reconnect its Turn or Context
lineage, or weaken the immutable deletion receipt.

Exact identity-preserving restore remains legal only into another
LearnerHome/database where those identities are not occupied. In the original
LearnerHome, the learner may explicitly import the file only as a new copy with
a fresh Interaction identity graph. There is no silent fallback from exact
restore to copy, no restoration/incarnation transition, and no deleted-to-live
edge at the original address.

Decision ID `SESSION-DELETE-RESTORE-001`.

## Scope of the correction

This correction reopens only these previously accepted claims:

- Gate 5's evidence that local JSON
  `import -> export -> delete -> import -> export` in one database preserves the
  original Session, Message, and Part identities;
- Gate 8's rule that ordinary Session deletion always removes presentation
  lineage beyond independently required command receipts;
- Gate 12's rule that ordinary Session deletion never retains an optional
  Session-level Interaction audit, its admission rule for an absent Session
  identity now occupied by the mandatory deletion control receipt, and only the
  local-import composition, imported-control-state safety, and Session
  presentation ordering needed to distinguish exact restore from a genuine new
  copy; and
- Gate 18's rule that deletion always leaves no retained Context association
  and its continuation assumption that every retained transcript writer already
  preserves the order consumed by paging and Context.

It does not reopen:

- Gate 5's terminal-only carrier disposition, local-file-only import, network
  exclusion, current project/directory rebinding, or other retained local
  capabilities;
- command occurrence, effect, replay, permission, or atomic settlement;
- ordinary root/delegated Turn admission, membership, terminal outcome,
  cancellation, recovery, child lineage, or busy-input behavior;
- Context compilation, budgets, immutable admission cuts, lazy owner reads,
  provider-visible rendering, or fresh/resumed Session composition;
- any durable Course, Artifact, navigation, steering, Goal, learner evidence,
  FutureAttention, Assignment, learner-state judgment, or advisory-suggestion
  lifecycle; or
- general selective deep deletion across learning authorities.

The optional audit is an Interaction-owned deletion projection. A second,
strictly narrower Interaction-owned control receipt preserves the identity and
settlement of the destructive request itself. The control receipt exists only
to make permission, replay, conflict, crash recovery, and later audit purge
truthful after the Session row has gone; it is not optional inspection lineage
and Gate 22 may not present it as Context/read/citation history. Neither record
is a new learning authority, universal event store, activity ledger, model-
rationale record, or Gate 22 consumption owner.

Decision ID `SESSION-DELETE-SCOPE-001`.

## Required learner-visible choice

A supported deletion proposal must bind one exact root Session, the complete
current descendant closure, and one uniform semantic mode for that whole tree
before any destructive transaction begins:

```text
delete Session bodies and inspection lineage

delete Session bodies and retain the minimal structured audit
```

These labels describe semantics, not pre-authorized API names. The primary TUI
must explain the material difference in ordinary language, identify the root
and every currently selected descendant, state that the chosen mode applies to
all of them, and obtain the learner's explicit selection. A non-interactive
carrier must supply the same typed root, exact-tree precondition, and uniform
choice. Per-descendant modes are not admitted by this correction. An absent,
unknown, stale, or ambiguous choice does not delete anything; there is no silent
default.

The permission proposal binds an ordered canonical target descriptor containing
the root Session ID and every selected `(Session ID, parent Session ID)` pair.
Its count and fingerprint are the destructive tree precondition. The deletion
transaction recomputes the closure and parent links from authoritative Session
rows. Any added, removed, or reparented descendant yields typed
`session_tree_changed`, commits no deletion, audit, applied control receipt, or
other durable mutation, and requires a newly presented and selected proposal. A
child created after presentation is therefore never swept into an earlier
choice.

The bound choice participates in permission, replay/conflict, and settlement
truth through the deletion authority below. It is not inferred from a command
name, a prior Session preference, or the absence of an audit request.

Decision ID `SESSION-DELETE-ADMISSION-001`.

## Destructive request and settlement authority

Session deletion gains one narrow Interaction-owned request/receipt boundary,
separate from both the Session transcript and the optional inspection audit.
Its semantic address is `(local LearnerHome/database identity, root Session
ID)`. Its trusted physical identity is an opaque deletion request ID allocated
and bound by the local runtime in the exact permission proposal; a carrier may
echo that identity but cannot choose a different root/tree/mode binding for it.
A canonical request fingerprint binds the ID to the exact root/tree
precondition, uniform mode, and proposal schema version. The later permission-
decision fingerprint binds the learner's answer back to that exact request
fingerprint. Reuse of the physical ID with any different request or permission
fingerprint is an invocation conflict before mutation.

That semantic address remains occupied for as long as its control receipt
survives. Optional-audit purge does not release it. A later Session
materialization cannot treat the absent root row as proof that the same ID is
physically new; the exact identity rule is defined below.

The pre-commit lifecycle is deliberately process-local:
`proposed -> authorized -> committing`. Permission wait and destructive commit
are separate; every decision-changing tree, owner, and projection read is
rechecked after permission. Permission denial, `session_tree_busy`,
`session_tree_changed`, unsupported/incomplete audit projection, or storage/
integrity failure returns a typed no-effect/failure result with no durable
request, receipt, audit, Session, Turn, Context, relation, or domain mutation.
Those safe failures have no retained exact-replay promise; a retry is a new
proposal and learner decision. This avoids a universal graveyard of no-effect
deletion attempts.

A process restart never automatically executes a proposed or authorized
request. If no applied receipt exists after restart, the tree remains live and a
new proposal is required. Only the successful commit crosses into durable
`applied` state; therefore a client that loses the response can distinguish
commit from rollback by the surviving receipt without blind replay.

The successful deletion transaction instead writes one immutable, non-cascading
control receipt before removing the Session tree. The receipt retains exactly:

- the physical deletion request ID, canonical request fingerprint, and
  settlement schema version;
- the root Session ID as the semantic address;
- the selected subtree count and canonical subtree fingerprint, but not the
  deleted descendant-ID list or titles;
- the selected uniform mode;
- the learner-permission decision fingerprint and proposal schema version;
- `outcome = applied`, the trusted deletion time, and
  `session_bodies_deleted = true`.

Other than the root Session ID used as the semantic address, no descendant
Session, Turn, Input, Message, Assistant/model-operation, Tool/Part, owner-
record/revision, or other transcript/lineage identity is legal in this receipt.
Nor may it contain a body, excerpt, summary, Tool payload, purpose, provider
metadata, or causal claim. The listed retained fields are the minimum required
to bind the destructive permission, distinguish exact physical replay from
conflicting reuse, and return the committed deletion time and mode after the
target rows have gone. They form one canonical typed settlement whose exact
bytes remain replayable across restart and later schema versions.

An exact physical replay returns this original immutable settlement byte-for-
byte and performs no write. Before allocating another trusted physical identity,
admission checks the surviving semantic-address receipt. A same-mode attempt is
therefore a non-mutating current-status read returning `already_deleted`, the
original receipt, and current optional-audit availability; it does not create a
duplicate request row or rewrite the deletion time. Another-mode attempt returns
`deletion_mode_conflict` at the same pre-admission boundary. If the original mode
retained audit and the learner now wants no lineage, the admitted operation is
the distinct audit-purge action, not a second full-mode Session deletion.

Audit purge has its own runtime-bound opaque physical request ID and permission
proposal for the exact bundle/deletion receipt. Safe refusal likewise writes
nothing. Successful purge writes an immutable non-cascading receipt retaining
only its request/fingerprint, settlement schema version, the original deletion
request ID, `outcome = applied`, and trusted purge time, then deletes the whole
bundle. Exact
purge replay returns that settlement; conflicting physical reuse fails. The
original deletion receipt never changes. Replaying it after purge reports the
original deletion outcome and cannot recreate the audit; current audit
availability is read separately from the audit/purge state.

Decision ID `SESSION-DELETE-SETTLEMENT-001`.

## Retired root Session identity

This correction does not introduce a Session-incarnation number. Within one
local LearnerHome/database, any Session ID named as the root semantic address of
an applied deletion control receipt is permanently retired from Session
materialization while that receipt exists. The receipt already retains that ID;
retirement adds no field, descendant list, transcript identity, or optional
inspection lineage.

Every authoritative path that can materialize a Session under a caller-supplied
or runtime-selected target ID uses one shared occupancy guard and transactional
recheck. This includes direct root creation, first-Turn root bootstrap,
delegated child creation, and fork-target creation. Under the exact target-ID
admission guard, the path checks both the live Session table and the unique
deletion-control semantic-address index before reserving an `admitting` owner;
the creation transaction rechecks them before writing a Session, Turn, Input,
Message, Part, child-lineage row, Event, or event sequence. If the target ID is
absent from live Session rows but occupied by an applied control receipt, it
returns typed no-effect `session_id_retired` with the existing body-free
destructive settlement; it does not install an owner, allocate a new Session
lifetime, rewrite the receipt, or create any durable row or event. A missing
parent or fork source whose exact ID is occupied by such a receipt is reported
as typed source-unavailable deletion truth rather than as a fabricated live
source or an indistinguishable never-existing ID.

Supported application transitions never allow a live Session row and an
applied deletion control receipt at the same semantic address. Session
materialization and deletion serialize through the same local transaction
boundary: if materialization commits first, deletion must observe the live or
changed tree and apply its ordinary busy/tree-precondition rules; if deletion
commits first, materialization observes the receipt and returns
`session_id_retired`. An overlap found during migration, startup integrity
checking, or a supported write is an integrity failure, not a choice of one
incarnation over the other. Arbitrary out-of-band SQL remains outside the
supported application boundary.

Physical replay of the original deletion request and semantic
`already_deleted`/`deletion_mode_conflict` reads remain legal against the
retired address. Audit purge never makes that address reusable. Destroying the
entire LearnerHome/database removes both the receipt and its database-scoped
address and is outside this narrow Session operation.

Decision ID `SESSION-DELETE-IDENTITY-001`.

## Local export, exact restore, and explicit copy import

A local JSON export is a learner-controlled file outside the LearnerHome
database. Session deletion removes neither that file nor arbitrary copies of it;
the deletion proposal must say so. Repa never scans for or silently destroys
external backups. Reintroducing exported content is a later explicit import,
not rollback of the deletion transaction.

### Supported offline-history bundle

Both exact restore and new-copy import accept only one closed, versioned
offline-history bundle. Before allocating a Session or owner, a closed decoder
must prove all of the following:

- the bundle contains exactly one Session, at least one Message, and at least
  one supported learner-visible historical presentation after validation; a
  Session-only, zero-Message, zero-Part, or otherwise non-renderable bundle is
  `import_history_unusable` and writes nothing;
- every Message and Part identity is unique, belongs to that Session and exact
  parent Message, and every Assistant parent, compaction, attachment, and other
  admitted historical typed reference is present in the bundle or in an
  explicitly legal target-database reference set;
- the exported Message array agrees with the canonical
  `(Message.time.created, Message ID)` order, every Assistant parent precedes
  the Assistant, and every per-Message Part array has one stable canonical
  ordinal and fingerprint; and
- a closed historical-safety decoder finds no executable-looking unfinished or
  Session-level control state. A pending/running Tool Part, nonterminal
  Assistant operation, unmatched step, unresolved compaction/subtask marker,
  or any nonempty `Session.revert` value—including its Message/Part target,
  snapshot, or diff—rejects the complete bundle as typed
  `import_history_unsafe`. A trailing unanswered User presentation is legal
  only as classified read-only history; it is never an admitted Turn input.

Unsupported message/part versions, missing required content, ambiguous order,
or an incomplete safety decision reject the whole import. Repa does not repair,
complete, execute, strip control state from, or ask a model to interpret an
unsafe bundle. It leaves the learner-managed source file unchanged.

### Durable administrative-history classification

Every admitted imported Message and Part is atomically bound to one complete
Interaction-owned administrative-history classification. This is a narrow
extension of the mature historical-presentation mechanism, not a Turn, Event,
learning authority, import activity log, or Gate 22 operational-lineage owner.
It consists logically of:

- one Session-scoped sealed manifest binding `offline_exact_restore` or
  `local_import_copy`, the supported bundle/classifier/order versions, source-
  file fingerprint, target Session ID, Message/Part counts, complete membership
  and order fingerprint, the administrative-history time frontier, and the
  validated absence of imported `Session.revert` control state; and
- one exact membership for every imported Message and Part, with its target
  identity and canonical presentation ordinal. For a copy, any retained source
  presentation time is explicitly untrusted imported display metadata and is
  not target causal time.

The Session, complete Message/Part graph, membership rows, and seal commit in
one transaction or none do. A raw imported Session, an uncovered Message/Part,
count/fingerprint mismatch, or membership that also belongs to a Turn input,
model operation, tool candidate/invocation, or current-work owner is an
integrity failure. The classification is Session-owned and is removed with the
Session; it never survives deletion as optional audit or learning provenance.

Continuation, startup recovery, current-work discovery, pending Tool/task/
compaction discovery, revert, cancellation, transcript paging, and every
Session-transcript writer must consume this exact classification and treat
every member as non-executable historical presentation. Imported Patch Parts
are inert presentation, not evidence of a target-worktree change. A revert
request naming an imported Message or Part returns typed no-effect
`historical_presentation_not_revertible` before snapshot, worktree, Session, or
transcript mutation. `Session.revert` may be created later only from a fresh
local target after the administrative-history frontier; its snapshot/diff is
local, and revert scanning plus cleanup compute the suffix from canonical
Session presentation order, never raw Message-ID comparison. Unrevert/cleanup
may restore or remove only that local suffix. A
missing seal or a revert target that overlaps administrative-history membership
is integrity failure, never permission to run cleanup over imported rows.

Context construction may place the sealed presentations before a new current
input as bounded conversation history, but cannot assign them a target Turn,
model/tool execution, Context/read/citation relation, command effect, learner
occurrence, or domain source. Restart reproduces the same classification,
revert exclusion, and ordering boundary before any owner or transcript writer
is admitted. Rendering or Context use cannot clear, partially rewrite, or
promote the seal.

Decision IDs `SESSION-DELETE-IMPORT-HISTORY-001` and
`SESSION-DELETE-IMPORT-CONTROL-001`.

### Exact restore into another database

Identity-preserving import is an administrative transcript restore, not a new
learner occurrence, model execution, or replay of the deleted Session. It is
legal only when the target LearnerHome/database has no live Session, deletion
control receipt, unavailable-source identity, or other retained Interaction
identity conflicting with any Session, Message, or Part identity in the closed
versioned import bundle. A different database identity makes the old deletion
receipt a different semantic address; it does not erase or supersede the
receipt in the original database.

The restore validates the complete bundle and writes the Session, Message, Part,
administrative-history membership, and seal atomically while applying Gate 5's
current project/directory rebinding. It preserves the supported original
Session/Message/Part identities and Message presentation timestamps. It restores
only the versioned historical content carried by that bundle; imported
`Session.revert`, snapshot, and diff control state are never admitted or
silently cleared. It does not fabricate a Turn,
learner occurrence, model/tool operation, Context cut, learning command, domain
record, source receipt, Event sequence, or Gate 22 lineage that the file does
not contain. The sealed pre-Turn transcript is read-only administrative history;
the first later learner interaction enters through an ordinary new Gate 12 Turn
in that existing Session.

A normalized restore envelope binds the source-file fingerprint, supported
bundle version, complete imported identity set, target database identity, and
project/directory rebinding. The target transaction rechecks every live,
retired, and retained-unavailable Interaction identity before its first write.
If another writer wins any target identity, the restore fails atomically. The
restore adds no permanent request receipt merely to support import replay: after
a lost response, an exact retry may return typed no-effect `already_present`
only when the complete normalized restored graph still byte-matches the
envelope, including the exact administrative-history membership, seal, order,
and frontier. Any extra, missing, or changed target row is an identity/content
conflict, not permission to overwrite or merge it.

### Explicit copy inside the original LearnerHome

An import targeting the original LearnerHome first resolves the exported root
ID against live and deleted Interaction state. If a deletion control receipt
occupies that ID, ordinary identity-preserving import returns typed no-effect
`session_id_retired`. It never silently chooses another ID.

The learner may instead explicitly choose **import as a new copy**. This is not
a restore. Repa validates the whole supported bundle, allocates a fresh target
Session ID plus fresh Message and Part IDs, and constructs a closed versioned
mapping for every typed identity-bearing field before any durable write. The
mapping includes Message-to-Session and Part-to-Message membership, Assistant
parent Message references, compaction tail/capacity-history Message references,
and nested typed attachment Session/Message/Part references. `Session.revert`
must already be absent under the safety decoder and is neither mapped nor
dropped. The copied Session is a new root; it does not
inherit a deleted or external parent Session. Unknown schema versions, dangling
or external typed references, duplicate source identities, incomplete mapping,
unsafe/unusable historical state, or any target identity collision reject the
whole copy without mutation.

Copy materialization reuses Gate 12's mature fork-start shape rather than
directly inserting an ownerless live Session. The imported transcript becomes
read-only `local_import_copy` historical presentation with no claim that its
learner, Assistant, Tool, or operation provenance was executed in this
LearnerHome. One genuine learner-authored root input with fresh Session, Turn,
Message, and occurrence identities is required to atomically materialize the
new Session, imported presentations, complete administrative-history
classification, and seal. The normalized start envelope binds the supported
bundle fingerprint, classifier/order versions, identity-mapping version, and
sealed presentation frontier; exact Turn replay cannot create a second copy
after response loss. Provider work begins only after that transaction commits
under the ordinary Gate 12 owner handoff.

The copy does not reconnect old unavailable-source receipts, deletion audit,
Context/read/citation relations, learning-command effects, domain records, task
results, or Event sequence. The old deletion receipt remains current for the
old root ID. Inspection of the new Session may show imported content and its
`local_import_copy` presentation provenance, but never relabel it as the old
Interaction or infer old operational lineage. Import output identifies the new
Session and that identity-preserving restore did not occur.

Exact restore and copy import share Gate 5's local-file-only boundary. Neither
may fetch a URL, consult an account/share service, trust model prose as a
mapping, or mutate the source file. API and option names remain implementation
detail; the typed distinction, explicit choice, atomicity, replay, and truth
above do not.

Decision ID `SESSION-DELETE-IMPORT-001`.

### Imported-history order and Session presentation frontier

The administrative-history seal owns no new event, but it provides the durable
seed required by Gate 12. Its immutable `history_frontier_time` is the maximum
of every validated causal or presentation timestamp carried by an exact-
restore bundle. Exact restore preserves those source timestamps, even when the
maximum is ahead of the target machine's current wall clock; the seed records
only that every later target transcript presentation must follow the imported
history, not that this LearnerHome observed activity at that time.

A new-copy import does not use source timestamps as target causal authority. It
assigns the copied Messages a fresh strictly monotonic target presentation
order matching the sealed canonical source ordinals; Parts retain canonical
order under their parent Message. Any retained source time is display metadata
only. The last normalized copy Message supplies the copy history seed, and the
genuine root input, User Message, and Turn in the same transaction must be a
strict successor.

Gate 12's Session presentation frontier is the current maximum of that imported
seed and every later committed Message presentation in the Session. Every
retained path that appends transcript Messages—not only ordinary Turn
admission—must reserve its complete ordered Message block through the same
Session mutation boundary before writing or beginning an external effect. This
includes direct shell/admin synthetic User, Assistant, and Tool presentation;
compaction, processor, plan, and other program-owned transcript writers; and
ordinary User/Assistant/model continuation. Each new Message receives a
representable time strictly greater than the current frontier and every earlier
Message in the same block. Part presentation inherits its parent Message order;
Tool start/end and Assistant completion time are floored nondecreasingly through
the same operation envelope rather than raw `Date.now()`.

For an exact restore, the first later writer may therefore be a non-Turn Session
utility or an ordinary Turn. A Turn admission computes one trusted time strictly
greater than the current Session presentation frontier and at least the ordinary
wall-clock, same-Session Turn, and shared-learning frontiers. That exact floored
value binds the learner occurrence, Turn/input, and current User Message.
Non-Turn utilities keep their own identities and never acquire Turn membership,
but they use the same presentation frontier. Message paging and Context
construction therefore place imported history, every later utility
presentation, and every later Turn in one stable order without relying on a
changed clock or fresh IDs to break timestamp ties.

If import cannot leave one representable strict successor, it fails atomically
as `import_history_frontier_unrepresentable`. If a later writer cannot reserve
its required block, it returns typed
`session_presentation_frontier_unrepresentable` before transcript, shell,
snapshot, worktree, model, Tool, or Event mutation. Restart reads or rebuilds
the exact current frontier from the sealed seed and committed transcript before
admitting a writer. An already-owned physical replay keeps its original order;
a genuinely new utility request reserves a later block. This ordering rule does
not invent universal utility replay, and retry/restart never reruns an external
effect merely to repair a presentation timestamp. Clock regression, a future
source timestamp, restart, and response loss cannot reorder the transcript,
mint a second Session/Turn, or move the database-wide learning frontier merely
because history was imported.

Decision ID `SESSION-DELETE-IMPORT-ORDER-001`.

## Data that both modes delete

Both choices remove the same exact root-and-descendant closure, subject to the
accepted atomic Session-tree deletion boundary and the newly bound precondition:

- learner, Assistant, and Tool presentation bodies;
- attachments and streamed or compacted presentation content;
- prompts, rendered Context bodies, Context contribution bodies, and
  summaries;
- Session-owned presentations or copies of Tool inputs, Tool outputs, task
  results, and model-authored rationales; independently owned typed command
  settlements remain under their accepted owner rather than being copied into
  the optional audit;
- Session-owned Message, Part, event, and ordinary presentation-lineage rows;
  and
- any derived cache or reverse index that could reconstruct those bodies.

Neither mode archives deleted content in a log, error, migration artifact,
inspection index, model summary, control receipt, or audit payload. Existing
independently owned domain effects and the minimum body-free receipts required
to keep those effects structurally and semantically resolvable remain governed
by Gate 8, Gate 12, and their domain owners. The deletion control receipt above
survives only for destructive-operation settlement. None of those receipts
preserves Gate 22 inspection lineage by implication.

Decision ID `SESSION-DELETE-BODIES-001`.

## Full deletion mode

The full mode removes every optional inspection association for every Session
in the bound subtree, including:

- the complete Gate 18 Context cut and contribution manifest;
- reverse mappings from a durable owner record or revision to that cut;
- exact-read and citation associations created only for later inspection;
- associations between those records and a model operation, Assistant answer,
  or selected Tutor action.

After commit, an inspection may report only what surviving owners truthfully
know: for example, a durable learning record still exists but its Interaction
source is deleted or unavailable. The deletion control receipt can establish
only that the exact selected tree was deleted under full mode. Absence of
retained audit cannot be reported as “the record was never in Context,” “the
record was never read,” or “the record did not affect the answer.” Those facts
are unknown after full deletion.

Full deletion cannot later be upgraded into retained audit. No summary, cache,
provider log, or current owner state may be used to backfill it.

Decision ID `SESSION-DELETE-FULL-001`.

## Minimal structured audit mode

The optional audit is one atomic bundle for the complete bound Session subtree.
It retains only the following semantic facts for that deleted tree and its exact
associated operations:

1. the owner-native record identity and exact revision;
2. whether that revision entered the operation's Context as semantic/full
   content, entered as locator-only, or did not enter;
3. whether the exact revision was read;
4. whether the exact revision was cited through a typed relation;
5. the corresponding operation's terminal status:
   `completed | failed | interrupted`;
6. the deletion time; and
7. the fact that the bodies were deleted.

The projection may use an opaque bundle key, opaque operation keys, canonical
coverage counts/fingerprints, and foreign-key structure strictly needed to
group, validate, purge, and read those facts. Such mechanical data is not an
additional user-visible fact and cannot expose deleted Session/Turn/Assistant/
Tool identities beyond what the allowlisted record-to-operation mapping needs.
In particular, the audit does not retain:

- transcript, learner input, Assistant answer, Context, prompt, Tool input,
  Tool output, task-result, attachment, or summary bodies;
- source excerpts, record bodies, citation prose, or material bytes;
- model, provider, token, cost, filesystem, or transport metadata;
- operation purpose, selected action, candidate ordering, rationale, ranking,
  attention weight, or hidden model state;
- timestamps other than the deletion time;
- omission, withholding, truncation, or authorization reasons beyond the
  allowlisted entered/not-entered classification; or
- inferred activity, adherence, progress, mastery, correctness, learning, or
  causal influence.

An exact read or typed citation is an occurrence fact, not proof that the model
used the record when composing its answer. A completed operation means only
that the operation reached its accepted terminal state; it does not certify
which inputs mattered.

A valid audit bundle covers every `turn_model_operation` whose `session_id` is
in the exact deleted closure and stores its terminal status. That table is the
accepted admitted interactive Tutor/Agent operation set; narrow program-owned
title, compaction, representation, and other internal model calls do not enter
it and cannot be excluded later by a purpose heuristic. For the complete
operation set the bundle stores the positive union of record revisions that
entered Context, were exactly read, or were cited. For any independently
resolved exact owner revision and covered operation, absence from a sealed
positive relation set proves `false`; absence outside the exact tree/operation
coverage proves nothing.

One uniform choice governs the whole closure: minimal-audit deletion either
seals complete coverage for all selected descendants or deletes none of them.
Later audit purge likewise removes the whole bundle atomically; it cannot purge
one child or one operation while retaining the rest. If authoritative live rows
cannot derive the complete allowlisted projection, minimal-audit deletion fails
atomically and leaves the entire tree live. It cannot commit a partial bundle or
add an unapproved `unknown` payload. The learner may retry after recovery or
make a new explicit full-deletion selection.

Decision ID `SESSION-DELETE-AUDIT-001`.

## Authoritative producers and exact joins

The prerequisite implementation must create the producer-side relations before
Gate 22 exists. The deletion coordinator composes the following live authorities
in one transaction; it does not infer them from presentation prose or make the
optional audit their original owner.

### Context classification

Gate 18's `turn_learning_context_cut.canonical_cut` is the authoritative Context
source. Its row joins to `turn_model_operation` on the exact
`assistant_message_id`; the stored typed cut must also bind the same Session,
Turn, Input, Assistant operation, cut time, and fingerprint already enforced by
Gate 18. A closed, versioned decoder keyed by Context schema/policy version and
section owner extracts only owner-native `(owner kind, record ID, exact revision
ID/version)` tuples from typed `sections[].entries[].locator` values. An entry
with a semantic value yields `semantic_full`; a locator-only/absent-semantic
entry yields `locator_only`; semantic/full wins if the same exact revision
appears both ways. No renderer text, prompt text, title, omission prose, or
current owner head is parsed or substituted. Unsupported typed versions make
minimal-audit deletion fail.

### Exact-read occurrence

The accepted lazy-read catalog in `LearningContext.LAZY_READ_CAPABILITY_IDS` is
the closed eligible tool set. This correction adds an Interaction-owned,
body-free model-operation relation producer. When one of those tools reaches a
truthful terminal Tool result, a versioned projector keyed by capability/tool
ID and result-schema version must run in the same durable settlement
transaction. It joins:

```text
turn_tool_candidate(part_id, assistant_message_id, session_id, tool)
  -> turn_tool_invocation(part_id, assistant_message_id, terminal state)
  -> the exact terminal Tool Part with the same part/message/session identity
  -> turn_model_operation(assistant_message_id, session_id)
```

For a successfully decoded typed result it writes one normalized
`exact_read` occurrence for each exact owner-native record revision actually
returned. Over-budget, unavailable, missing, failed, interrupted, or results
without an exact revision produce no positive read relation but still receive a
typed coverage outcome. Tool title text, JSON-shaped prose, model narration,
input arguments, and generic Tool metadata are not authoritative read facts.

### Typed-citation occurrence

A typed citation exists only when a registered owner command's first `applied`
transaction validates and commits an exact basis/reference relation in that
owner's immutable effect or revision. The same transaction writes the body-free
Interaction relation by joining:

```text
learning_command_invocation.part_id
  = learning_command_receipt.invocation_part_id
learning_command_invocation.assistant_message_id
  = turn_model_operation.assistant_message_id
learning_command_receipt/effect identity
  -> the registered owner table's exact basis/reference record and revision
```

The projector is closed and versioned by command/capability version and names
the exact owner table/identity columns it validates. A Tool argument alone,
model prose, query output, `already_applied`, `no_change`, rejection, or error
does not create a citation occurrence for the current model operation. The
domain owner remains authoritative for what its basis/reference means; the
Interaction relation owns only the mechanically observed occurrence-to-model-
operation link.

### Operation status and complete coverage

Gate 12's `turn_model_operation` row is the sole terminal-status producer. The
audit joins it by the same Assistant operation identity and accepts only
`completed | failed | interrupted`; whole-Turn `exhausted` remains a distinct
Turn outcome and does not widen this allowlist.

Each live model operation additionally receives one body-free lineage-coverage
seal. It can seal only after the Gate 12 candidate set is sealed and every
registered candidate has a terminal disposition. Each eligible lazy-read
candidate that was admitted must have a terminal invocation plus versioned
projector outcome; an eligible candidate that was truthfully never started is
covered as no read, not silently omitted. Each registered citation-producing
command candidate must likewise resolve to a first-applied projector relation or
an exact terminal non-applied/not-started disposition that creates no citation
for this operation. The seal binds the operation identity, projector/catalog
versions, exact candidate/invocation/command/source counts, and a canonical
relation-set fingerprint; it carries no content, purpose, selected action,
rationale, or extra user-visible semantic state. A positive relation set may be
empty. Missing coverage, a pending candidate/invocation, an unregistered
eligible version, or a mismatch among operation, Tool, command, and relation
counts is failure, not evidence of `false`.

For pre-migration live Sessions, the same registered versioned decoders may
materialize and seal these relations from still-present canonical Context cuts,
terminal typed Tool Parts, Gate 8 receipts, and exact domain-owner rows inside
the deletion transaction. They may not parse display prose or use current state
as a proxy. Any unsupported operation makes minimal-audit deletion fail without
mutation. Full deletion does not require lineage derivation.

At minimal-audit deletion, the transaction selects the exact operation set by
the bound subtree, verifies every operation terminal and coverage-sealed, and
materializes only the allowlisted union from the Context cut, normalized
read/citation relations, and model-operation status. It then deletes the live
cuts, Tool/command presentation bodies, and live relation/coverage rows with the
Session. The optional audit is therefore a deletion projection of named live
producers, not a retrospective source of those facts.

## Ownership and dependency direction

- Gate 8 preserves applied command effects, immutable receipts, and the
  body-free source-unavailable occurrence truth already required by surviving
  domain state. Its registered command settlement also produces exact typed-
  citation occurrence relations where applicable.
- Gate 12 owns admitted model-operation membership and terminal truth, refuses
  busy deletion without interruption, owns the deletion request/control-
  receipt settlement boundary, and supplies the Session mutation,
  administrative-history/revert exclusion, and all-transcript-writer
  presentation frontier used by restore/copy continuation.
- Gate 18 owns immutable Context cuts and the closed lazy-read capability
  catalog; its typed Context decoders and terminal Tool-result projectors
  produce the exact inclusion/read facts before deletion.
- Domain owners keep their own records, revisions, sources, corrections,
  basis/reference meanings, and deletion lifecycles. Session deletion does not
  silently deep-delete them.
- Gate 22 may later read and render the surviving projection. It cannot produce,
  mutate, widen, or repair it, or infer missing bodies or causal influence.

The optional audit follows the exact deleted Session tree's audit lifecycle, not
the lifecycle of any referenced durable learning record. A later correction of a
Goal, Assignment, learner-state judgment, or suggestion does not rewrite the
old audit. A later deletion of the audit does not delete or correct those
domain records.

Decision ID `SESSION-DELETE-OWNERSHIP-001`.

## Legal lifecycle

The semantic states are:

```text
live -- learner selects full deletion --> deleted_without_inspection_lineage
live -- learner selects minimal audit --> deleted_with_minimal_audit
deleted_with_minimal_audit -- learner purges audit --> deleted_without_inspection_lineage
```

Both deleted states include `root_session_id_retired` for the receipt's exact
database-scoped root address. There is no transition from either deleted state
back to a live Session with that ID.

Identity-preserving restore into another LearnerHome/database is a sealed
`live_administrative_history_no_turn` state at a different database-scoped
semantic address, not a transition out of either deleted state above. It is
legal only with a nonempty usable history graph, complete administrative-
history coverage, no executable current work, and a durable Session frontier.
It may receive a safely ordered non-Turn Session utility while remaining
pre-Turn administrative history; that utility cannot target imported history
for revert or execute imported control state. Its first local learner input
moves that same Session to ordinary `live_with_local_turn` through Gate 12
admission after the current presentation frontier without promoting any
imported row. Explicit same-home copy atomically materializes a different
`live_with_local_turn` root Session with sealed imported history, fresh
identities, and a genuine new Turn; it likewise creates no edge back to the
deleted address.

There is no edge from `deleted_without_inspection_lineage` to
`deleted_with_minimal_audit`. The two `live` transitions are alternatives, not
successive phases. The only legal retention-reducing transition from
`deleted_with_minimal_audit` is complete audit purge. No transition restores
bodies, recreates Context, or widens the audit. The immutable deletion control
receipt survives all three transitions; the separate purge receipt records only
the later destructive settlement and never restores or substitutes for audit.

Deleting the optional audit is itself an explicit destructive action with the
separate request/receipt and truthful success/failure settlement defined above.
It uses the same Session-deletion owner and local transaction boundary; it does
not reuse the original physical request and does not require or authorize the
general post-baseline cross-authority Data Lifecycle capability.

Decision ID `SESSION-DELETE-LIFECYCLE-001`.

## Atomicity, concurrency, and recovery

Deletion never initiates cancellation, interruption, or terminalization. Before
opening the destructive transaction, the accepted process-local tree guard
checks every selected Session. If any Turn has a valid `admitting`, `running`,
or `terminalizing` owner, the carrier immediately returns typed no-effect
`session_tree_busy`; it emits no interrupt/cancel/finalize event, writes no
request/receipt, and mutates no Session, Turn, Context, audit, relation, or
domain row. The learner may separately authorize interruption of exact Turn
identities. That interrupt must reach its own terminal settlement before a newly
admitted deletion request is presented.

A same-process ownerless running row is handled only by Gate 12's ordinary
orphan-recovery operation. Recovery truthfully settles that Turn (including
`interrupted` where Gate 12 requires it) without deleting the Session; deletion
then requires a new physical request against a fresh exact-tree proposal. A
repeat after the no-effect refusal is a new proposal, not physical replay of the
refusal, and cannot be converted into success without the fresh choice.

After the tree guard closes new admission, the destructive transaction must:

1. recompute and byte-compare the exact root/descendant target descriptor;
2. transactionally recheck that every selected Turn/model operation is already
   terminal and that no valid owner is active;
3. for minimal-audit mode only, verify complete producer coverage and derive the
   allowlisted bundle from the still-readable authoritative rows;
4. preserve independently required domain effects and body-free receipts;
5. write the immutable applied deletion control receipt;
6. delete the entire selected Session tree, all prohibited bodies, and all
   non-allowlisted lineage;
7. for minimal-audit mode only, seal one body-deleted bundle for the exact
   closure; for full mode, leave no optional audit; and
8. publish deletion visibility and discard process-local owners only after
   commit.

The transaction's terminal recheck can observe either a completion that
settled before the guard closed or a busy owner that still exists; it cannot
cancel work to manufacture the first ordering. A closure change, newly active
owner, constraint failure, projection failure, injected audit-write/body-delete
failure, or process crash before commit leaves the complete tree, optional
audit, and applied control receipt unmodified. A crash after commit is recovered
from the applied control receipt and, when chosen, the sealed audit; the Session
deletion does not run again and the original deletion time does not change.

Session materialization races use the same serialized database boundary. A
root, child, or fork-target materialization that commits before deletion is
visible to the deletion tree/owner rechecks; one that loses to the applied
deletion sees the control receipt before any owner reservation or durable write
and returns `session_id_retired`. No legal ordering contains both the receipt
and a new live Session at its root address.

Exact restore and copy import each validate one immutable read of the complete
local file before opening their write transaction. Exact restore commits its
closed Session/Message/Part bundle, complete administrative-history
classification, absence of `Session.revert`, seal, canonical order, and
frontier atomically in the other database or writes nothing, with target-
identity occupancy rechecked under the same local-writer serialization. A
response-lost retry returns
`already_present` only from an exact normalized graph/seal match; target drift
or a competing materialization is a non-mutating conflict. Same-home copy binds
the file fingerprint, classifier/order and mapping versions, fresh identity
graph, normalized historical order/frontier, and genuine root input into Gate
12's atomic start envelope; response loss replays that exact Turn rather than
allocating another copy. A
concurrent delete at the exported root address serializes through the same
occupancy guard: import before deletion remains visible live state, while
deletion before import yields `session_id_retired`. Copy writes only at its new
address and never alters that ordering or the old receipt.

At exact-restore commit and again before the first later transcript writer, the
target checks that `Session.revert` remains absent and
that every imported Message/Part is covered by the sealed administrative-
history classification and that none participates in a Turn/current-work
relation. Startup recovery, current-work and pending-task reads, transcript
paging, revert/unrevert/cleanup, every transcript writer, and Context compilation
make the same check after restart. A missing or partial seal, imported active
revert, imported-target revert, executable-looking imported Part, changed
order/frontier, or attempted current-work relation is an integrity failure; it
is never repaired by inventing a Turn, applying a snapshot/Patch, deleting
imported rows, or executing imported work.

Every post-import Message block reserves and advances the Session presentation
frontier under the same mutation serialization as its transcript insert. A
direct shell/admin path commits its ordered synthetic presentations before the
external command begins; failure to reserve commits neither presentation nor
external effect. Completion, retry, and restart preserve the admitted block and
cannot replace its time with a lower wall-clock value. A locally admitted revert
may bind only a non-historical target after the sealed imported frontier, so
revert scanning, unrevert, and cleanup use canonical Session presentation order
rather than Message-ID comparison and can touch only target-local snapshot/
worktree state and the local transcript suffix.

Deletion must not sample a model, rerun a Tool, replay an external operation,
recompile an old Context cut, invoke a cancellation path, or wait for active work
to finish. Completion, learner-authorized interruption, and ownerless-orphan
recovery remain independently settled Gate 12 actions followed by a fresh
deletion admission.

Decision ID `SESSION-DELETE-ATOMIC-001`.

## Historical data and migration

Previously deleted Sessions remain under their recorded source-unavailable
semantics. A migration fabricates neither a deletion control receipt nor an
optional audit for them: there was no trusted request identity/tree precondition
to bind and the required live sources are gone. The new audit cannot recover
facts that were not retained. A migration must not infer Context inclusion,
read, citation, terminal status, or bodies from current domain state, summaries,
logs, or old test artifacts.

For a live pre-migration Session tree, the retained-audit option is legal only
when every operation is terminal and the registered producer decoders can
derive and atomically seal the complete allowlisted projection from its exact
still-live rows. Unsupported or partially recoverable operations make that mode
fail without deletion; they never receive fabricated negatives. Full deletion
remains separately available through a new explicit selection and still writes
the first real control receipt at commit.

The migration and deletion constraints are versioned schema artifacts. Current
helpers may not retroactively change historical migrations or leave two
databases at one `user_version` with different deletion behavior.
The predecessor has no deletion-control rows, so the migration creates no
retired identity by inference. It verifies that no live Session shares a root
address with any applied receipt and fails atomically on overlap; the shared
creation/deletion guard and address uniqueness preserve that exclusion for all
later supported application writes.

Decision ID `SESSION-DELETE-MIGRATION-001`.

## Primary-TUI and retained-carrier meaning

The primary natural-language TUI must make the two choices understandable
before deletion. It need not expose table names, Context hashes, or internal
operation IDs. It must identify the selected root and current descendant
Sessions, make clear that one mode covers the entire displayed tree, and say,
in substance:

- both choices permanently remove the conversation and content bodies;
- retaining the minimal audit keeps only the listed operational facts;
- the audit cannot explain why the Tutor produced an answer; and
- the retained audit can later be permanently deleted; and
- deletion does not remove separately exported files, but any later import into
  this LearnerHome cannot restore the deleted Session's original identity.

After deletion, inspection must distinguish:

- full deletion: bodies and optional lineage unavailable;
- minimal audit: bodies unavailable, allowlisted operational facts available;
- later audit deletion: bodies and optional lineage unavailable; and
- query failure or unknown coverage: not silently equivalent to any of the
  above.

Any retained carrier that exposes Session deletion uses the same typed semantic
choice, exact-tree precondition, permission binding, and settlement. A stale
tree requires a newly shown proposal rather than a hidden automatic retry.
Carrier-specific layout may differ; retention meaning may not.

The local import carrier must distinguish identity-preserving restore from
explicit copy before mutation. A retired exact restore reports the old Session
as deleted and offers no automatic fallback. Copy presentation identifies the
new target Session, requires the genuine learner root input that materializes
it, and states that imported history has new identities and no restored
operational lineage. A bundle with active revert/snapshot control state reports
typed unsafe-import refusal rather than silently clearing or executing that
state. After a valid import, an attempt to revert an imported presentation
reports that historical presentation as non-revertible with no worktree or
transcript mutation. A direct shell/admin result remains a non-Turn utility but
appears after the imported history under the same Session presentation order.

Decision ID `SESSION-DELETE-TUI-001`.

## Failure matrix

| Condition | Required result |
| --- | --- |
| deletion mode absent or unknown | reject before mutation; do not choose a default |
| exact descendant closure changes after presentation | `session_tree_changed`; no mutation; show and authorize a new exact-tree proposal |
| learner chooses full deletion | uniformly remove the exact tree's Session-owned bodies, Context, live relation projection, and optional inspection associations; preserve the applied deletion control receipt plus independently required source-unavailable receipts/domain state |
| learner chooses minimal audit | atomically seal one complete allowlisted bundle for the exact tree and remove all bodies/non-allowlisted lineage |
| valid admitting/running/terminalizing owner exists | immediate `session_tree_busy`; emit no interrupt/cancel/finalize action and mutate nothing |
| learner separately interrupts exact work | interruption settles under Gate 12; deletion requires a new physical request/tree proposal afterward |
| ownerless running row exists | ordinary orphan recovery settles separately; no deletion or blind replay; retry through a new request |
| operation completes before the closed-tree transactional recheck | include its already-terminal truth in the chosen atomic ordering; no mixed snapshot |
| operation is already interrupted or failed | retain its truthful model-operation terminal status only when minimal-audit mode is chosen |
| audit derivation is partial or fails | fail the minimal-audit deletion and leave the Session live; never seal a partial bundle or guessed `false` |
| crash before commit | live Session remains; no visible deletion or sealed audit |
| crash after commit before presentation | restart reads the independent control receipt and returns the committed selected mode/time without repeating deletion |
| exact applied deletion request is replayed | return the immutable original settlement byte-for-byte; do not rewrite deletion time or projection |
| new admission attempt uses same address and same mode | before allocating another physical identity, return `already_deleted` with original receipt/current audit availability; no mutation |
| same semantic address requests another deletion mode | `deletion_mode_conflict`; do not widen/recreate retention; use explicit audit purge where applicable |
| direct-root, first-Turn, child, or fork-target materialization uses an ID occupied by an applied deletion control receipt | `session_id_retired` with the existing body-free deletion settlement; create no owner, Session, Turn, Input, Message, Part, lineage, Event, or sequence |
| a parent or fork source lookup names a deleted root whose control receipt survives | return typed source-unavailable deletion truth; do not treat it as a live source or an indistinguishable never-existing ID |
| Session materialization races the deletion commit at the same root address | serialize to either a live/precondition-visible Session before deletion or `session_id_retired` after deletion; never persist both a live Session and receipt |
| identity-preserving local import targets a receipt-occupied ID in the same LearnerHome | `session_id_retired`; preserve the old receipt/audit state and write no Session, Message, Part, Turn, Event, or mapping |
| imported bundle has no Message, no supported learner-visible historical presentation, or an incomplete historical-safety decision | `import_history_unusable`; create no Session, Message, Part, classification, owner, Turn, or Event |
| imported bundle contains pending/running Tool state, a nonterminal Assistant, unmatched step, or unresolved compaction/subtask | reject the whole import as unsafe historical state; never execute, complete, recover, or silently drop the unfinished row |
| imported Session has any nonempty `revert` target, snapshot, or diff | typed `import_history_unsafe`; write no Session/history seal, execute no snapshot/Patch/worktree operation, delete no transcript row, and do not silently clear the control state |
| learner explicitly imports the backup as a copy in the same LearnerHome | validate and completely reidentify the closed bundle, normalize a fresh monotonic presentation order/frontier, then atomically create a fresh root Session, complete `local_import_copy` administrative-history classification, and one genuine strict-successor learner Turn; reconnect no old lineage |
| identity-preserving restore targets another LearnerHome/database with no identity conflict | atomically restore the exact supported Session/Message/Part identities and timestamps plus complete `offline_exact_restore` administrative-history classification, order seal, frontier, and current project/directory rebinding; fabricate no Turn, Context, learning state, or operational lineage |
| administrative-history membership, count, order, safety, or frontier cannot seal completely | reject the entire restore/copy without a raw Session or uncovered row; never reinterpret imported content as current work |
| learner requests revert at an imported Message/Part, including an imported Patch Part | `historical_presentation_not_revertible`; do not track/restore a snapshot, touch the worktree, set/clear `Session.revert`, delete a transcript suffix, or change the history seal/frontier |
| a fresh local revert is admitted after imported history | bind only a local target after the imported frontier; derive the affected suffix from canonical Session presentation order rather than raw Message-ID comparison; unrevert/cleanup may affect only its target-local snapshot/worktree and local transcript suffix and cannot cross into administrative-history membership |
| first later Turn follows exact restore with a regressed target clock or future imported timestamp | floor the occurrence, User Message, Turn/input, and later causal chain to a representable strict successor of the current Session presentation frontier; preserve imported and intervening utility order and infer no target activity from the source time |
| direct shell/admin or another non-Turn writer follows imported history under future source time or clock regression | reserve every new Message plus nondecreasing Tool/Assistant times after the current Session presentation frontier before transcript or external-effect mutation; retain non-Turn identity and stable paging/Context order |
| no strict successor exists in the stored time domain | `import_history_frontier_unrepresentable`; write no restore/copy state |
| an admitted later writer cannot reserve its complete strict-successor Message block | `session_presentation_frontier_unrepresentable`; begin no shell/snapshot/worktree/model/Tool effect and write no transcript/Event state |
| another-database exact-restore response is lost and retried before target drift | compare the complete normalized target graph, administrative-history seal, order, and frontier and return `already_present` only on an exact match; write no duplicate row or permanent replay receipt |
| another writer races exact restore or any restored target row differs | serialize at the target database and return typed identity/content conflict with zero partial write; never overwrite, merge, or infer successful replay |
| copy bundle has an unknown version, dangling/external typed reference, duplicate source identity, incomplete mapping, target collision, or unstable canonical order | reject before materialization; never partially remap, silently drop a reference or control state, or rely on fresh IDs to choose order |
| copy materialization response is lost and retried | replay the exact Gate 12 root Turn/start envelope and return the same new Session; never allocate another copy |
| retained audit is later deleted | write a separate purge settlement and remove the complete optional subtree bundle atomically; do not alter the original deletion receipt or independent domain records |
| original minimal-mode deletion replays after purge | return its original applied settlement; report current audit availability separately; never recreate audit |
| Gate 22 inspects retained facts | show operational lineage and body-unavailable state; never per-record Tutor causality |

## Rejected designs

This correction rejects:

- silently choosing retention or full deletion;
- applying one unbound choice to a descendant created after the proposal,
  mixing retention modes inside one Session subtree, or partially purging that
  subtree's audit;
- cancelling, interrupting, waiting for, or terminalizing active work as part
  of deletion;
- retaining a transcript, answer, Context, Tool result, excerpt, or summary
  under an “audit” label;
- keeping operation purpose, selected action, ranking, rationale, or model
  metadata outside the allowlist;
- treating absence of an audit row as a proven negative without exact retained
  coverage;
- parsing rendered Context, Tool output prose, or command arguments as an
  authoritative inclusion/read/citation fact;
- using a model to reconstruct deleted content or causal influence;
- making the audit a universal activity, consumption, action, purpose, or
  learning-event owner;
- allowing Gate 22 to extend the audit schema opportunistically;
- treating the mandatory deletion/purge control receipts as optional Gate 22
  lineage or deleting them with the optional audit;
- treating an absent Session row as a reusable identity when an applied
  deletion control receipt still occupies that exact database-scoped root
  address, adding a Session incarnation merely to preserve such reuse, or
  deleting/rewriting the receipt to admit restore;
- silently converting a failed exact restore into a copy, restoring a deleted
  ID in the same LearnerHome, or treating another database's exact restore as a
  resurrection in the original database;
- changing only the Session ID during copy while reusing Message/Part or typed
  nested identities, partially mapping a bundle, or parsing opaque prose/
  metadata to guess references;
- treating imported content as proof of the old learner occurrence, Turn,
  model/Tool execution, Context, learning effect, or Gate 22 lineage;
- materializing an empty imported Session, leaving imported Messages/Parts
  outside a complete durable historical-only classification, or treating a
  pending/running Tool, nonterminal Assistant, unmatched step, or unresolved
  task/compaction marker as recoverable current work;
- importing, clearing, remapping, or executing a source `Session.revert`,
  snapshot, or diff; allowing a later revert to target imported historical
  Message/Part/Patch state; or letting unrevert/cleanup cross the sealed history
  boundary into imported rows or source-derived worktree state;
- ordering imported and later local messages only by an untrusted wall clock or
  newly generated ID, preserving future source time without seeding the Session
  frontier, flooring only ordinary Turns while direct shell/admin or another
  transcript writer bypasses it, or using source time from a copy as target
  causal authority;
- fabricating a Turn/Event merely to legalize imported history, or advancing the
  database-wide shared-learning frontier as though import proved learner
  activity;
- claiming Session deletion removed an external export file, or scanning for
  and deleting learner-managed backups;
- restoring minimal audit after full deletion; and
- using this narrow purge to authorize selective deep deletion of independently
  owned learning state.

## Acceptance evidence boundary

A correction implementation candidate must provide deterministic evidence for
at least:

1. explicit primary-TUI selection with no default; the exact root, existing
   descendant closure, and uniform mode must be visible and identically typed in
   every retained deletion carrier;
2. an existing descendant and a child added/reparented between presentation and
   transaction, proving the first tree is deleted uniformly and the changed tree
   fails atomically until a newly selected proposal;
3. full deletion removing all Session-owned bodies, Context cuts, live
   read/citation relation rows, and optional audit while leaving only the exact
   applied deletion control receipt plus independently owned learning effects
   and their minimum source-unavailable truth;
4. client-response loss and restart after full deletion, proving physical replay
   from the immutable surviving control receipt, same-mode semantic duplicate,
   different-mode conflict, and unchanged original deletion time;
5. direct-root, first-Turn root, delegated-child, and fork-target attempts to
   materialize the deleted root ID after full deletion, minimal-audit deletion,
   and later audit purge, proving typed `session_id_retired`, the unchanged
   body-free settlement, and zero owner/Session/Turn/Input/Message/Part/lineage/
   Event/sequence writes; an otherwise identical fresh target ID must still
   materialize normally;
6. a deterministic Session-materialization/deletion race at the same root ID,
   proving the only legal orderings are materialization-before-delete with the
   live/tree precondition observed, or deletion-before-materialization with
   `session_id_retired`; database/startup integrity evidence must reject any
   live-Session/control-receipt overlap;
7. minimal-audit deletion retaining every allowlisted field and no prohibited
   body or metadata across direct database inspection and restart;
8. producer-level traces for semantic/full and locator-only Context entries,
   successful exact lazy read, typed first-applied owner citation, and completed,
   failed, and interrupted model operations, proving the exact table/identity
   joins and versioned projector outputs without causal overclaim;
9. negative relation results from a complete sealed operation/candidate/source
   set, plus atomic refusal of missing coverage, mismatched counts/fingerprint,
   an unregistered tool/command/result version, and a deliberately unsupported
   historical operation;
10. a valid `admitting`, `running`, and `terminalizing` owner at both preflight and
   transactional race points, proving typed `session_tree_busy`, zero deletion/
   audit/domain mutation, and no emitted interrupt/cancel/finalize action;
11. separately authorized exact-Turn interruption and ownerless-orphan recovery,
   proving each settles before a new deletion request and that deletion performs
   no blind replay;
12. completion before the closed-tree recheck, injected audit-write failure,
     injected body-delete/control-receipt failure, crash-before-commit, and
     restart-after-commit, each proving one atomic ordering;
13. later whole-bundle audit purge, its independent physical replay/conflict,
     replay of the unchanged original deletion receipt after purge, no audit
     recreation, and no domain-record deletion;
14. migration from the frozen accepted predecessor database, proving no receipt
     or audit for already deleted Sessions, no fabricated eager backfill, exact
     supported live-row decoding, no live-Session/control-receipt address
     overlap, and atomic refusal of unsupported live history;
     and
15. a production owner-neutral Core/Protocol read/decoder over both deletion
     modes and post-purge state, proving the non-causal typed projection without
     depending on Gate 22 or a diagnostic-only fixture;
16. the former Gate 5 same-database round trip rebound as
    `export -> delete -> exact import`, proving typed `session_id_retired`, zero
    import writes, byte-stable deletion replay/current audit truth, and the
    external backup left untouched;
17. explicit same-home copy of that file with a genuine learner root input,
    proving fresh Session/Turn/occurrence/Message/Part identities, complete
    Assistant-parent/compaction/nested-attachment mapping, validated absence of
    imported `Session.revert`, a complete
    sealed `local_import_copy` membership and order fingerprint, normalized
    target presentation time, no old receipt/Context/domain reconnection,
    truthful new-ID output, and exact response-loss replay without a duplicate;
18. identity-preserving restore of the same supported backup into another clean
    LearnerHome/database, proving original Session/Message/Part identities and
    timestamps, current project/directory rebinding, complete sealed
    `offline_exact_restore` coverage, validated absence of imported
    `Session.revert`, no mutation of the original database, and no fabricated
    Turn/Context/learning/Event lineage before restart;
19. continuation after that exact restore under both a regressed target clock
    and a source timestamp ahead of the target clock, proving transcript paging,
    current-work discovery, Context order, occurrence, User Message, Turn/input,
    model operation, terminal event, restart, and the next later Turn all place
    imported history and any intervening utility presentation before later local
    work through the Session strict-successor frontier without advancing shared-
    learning time merely for import;
20. a zero-Message bundle, a non-renderable bundle, and separately a bundle
    containing pending/running Tool state, a nonterminal Assistant, unmatched
    step, unresolved compaction/subtask state, and each nonempty
    `Session.revert` target/snapshot/diff shape, proving typed whole-import
    refusal with zero Session/Message/Part/classification/Turn/Event, snapshot,
    worktree, or transcript-deletion writes;
21. consumer-path evidence after restore and copy proving every imported row is
    covered, read-only, and absent from Turn input/model/tool membership,
    current-work/pending-task/recovery/cancellation/revert candidates, while
    bounded Context may use it only as historical conversation presentation;
    corrupt or partial coverage and any `Session.revert` overlap must fail as
    integrity truth after restart;
22. exact-restore response loss proving complete normalized graph/seal/order/
    frontier `already_present` without a new receipt, plus competing target
    materialization, post-restore drift, unrepresentable frontier, and injected
    classification/seal failure proving non-mutating conflict or atomic refusal;
23. unknown bundle/mapping/classifier/order version, duplicate source identity,
    dangling or external typed reference, target collision, unstable canonical
    order, injected mapping/presentation/Turn/Event failure, and file-change
    race, each proving atomic refusal with no partial Session, classification, or
    identity map; and
24. retained local-file-only behavior: HTTP(S) input performs no network call,
    exact-versus-copy meaning is explicit, no silent fallback occurs, and the
    deletion surface truthfully states that learner-managed export files are
    outside its deletion scope;
25. valid exact-restore and copy histories containing inert Patch Parts, proving
    revert targeting every imported Message/Part returns
    `historical_presentation_not_revertible` before snapshot tracking/restoration,
    Patch application, worktree mutation, `Session.revert` mutation, transcript
    deletion, or frontier change; after restart, one fresh local Turn/revert/
    unrevert/cleanup trace with imported IDs sorting on both sides of local IDs
    derives the suffix from canonical presentation order and affects only the
    local suffix; and
26. every retained Session transcript writer after exact restore and copy,
    including direct shell/admin plus representative compaction/program-owned
    presentation and ordinary Turn/model continuation, under future source time
    and regressed clock. Paging and Context must preserve imported-before-local
    order; Tool/Assistant times remain nondecreasing; restart and physical replay
    keep the original block; a new request receives a later block; and injected
    unrepresentable/block-reservation failure begins no transcript, shell,
    snapshot, worktree, model, Tool, or Event effect.

The evidence must inspect the actual production deletion path, producer
settlements, stored database, emitted lifecycle events, and owner-neutral read.
A fixture that directly inserts the desired audit result, model prose describing
deletion, or a diagnostic-only command cannot close the boundary. Gate 22's TUI
consumption is deliberately absent from this prerequisite evidence; it belongs
to the later Gate 22 implementation/evidence review after this real producer is
accepted.

Decision ID `SESSION-DELETE-EVIDENCE-001`.

## Independent review history

Whole-Gate review run `G22-WG-20260813-019ff8e2-01` first returned **Revise** on
this prerequisite contract layer. Its second pass closed
`G81218-CR-001..007` against their original acceptance impacts, then returned
**Revise** with one new acceptance-changing identity collision:
`G81218-CR-008`. The reviewed candidate let a deleted root Session ID be
materialized again while the immutable control receipt still used that ID as
the deletion semantic address. This rebound retires every control-receipt root
ID across direct-root, first-Turn, delegated-child, and fork-target
materialization; defines source-unavailable lookup and race/integrity behavior;
and added deterministic recreation and serialization evidence. The same
reviewer closed `G81218-CR-008` without regressing `G81218-CR-001..007`, then
returned an owner blocker `G81218-CR-009`: permanent same-database identity
retirement contradicted Gate 5's accepted same-database, same-ID offline restore
round trip.

The maintainer selected deletion finality at the original address. This rebound
therefore explicitly reopens only Gate 5's same-database identity-preserving
restore evidence. Exact restore may preserve identities in another database;
same-home import requires an explicit completely reidentified copy composed
with one genuine Gate 12 root Turn. The original receipt and deleted address
remain immutable, and no incarnation transition exists. The same reviewer
closed `G81218-CR-009` and confirmed `G81218-CR-001..008` remained closed, then
returned **Revise** with two new Gate 12 composition defects:

- `G81218-CR-010`: exact restore could materialize an empty Session or leave
  executable-looking Message/Part state without a complete durable pre-Turn
  historical classification consumed by continuation and recovery; and
- `G81218-CR-011`: neither restore nor copy seeded a stable imported-history
  order and Session frontier, so a future source timestamp or regressed target
  clock could place the first later Turn before imported history.

This rebound rejects empty/unusable and unsafe unfinished bundles; requires one
complete Interaction-owned administrative-history membership and seal consumed
by current-work, recovery, Context, and restart paths; normalizes copy order;
preserves exact-restore timestamps; and binds the first local Turn to a
representable strict successor of the sealed history frontier. The same reviewer
confirmed those exact cases were repaired but replaced, rather than closed,
`G81218-CR-010..011` with two narrower production-path defects while confirming
`G81218-CR-001..009` remained closed:

- `G81218-CR-012`: imported live `Session.revert` target/snapshot/diff state and
  imported Patch Parts could still reach revert, unrevert, cleanup, and
  `withCleanAdmission`, mutating the target worktree or sealed transcript or
  making continuation unusable; and
- `G81218-CR-013`: the imported frontier constrained ordinary Turns but not
  retained direct shell/admin and other non-Turn transcript writers, whose raw
  wall-clock timestamps could page before future-dated imported history.

This rebound refuses every import with nonempty `Session.revert` control state,
makes imported Message/Part/Patch presentations non-revertible, confines later
local revert/unrevert/cleanup to a local post-frontier suffix, and binds every
retained Session transcript writer to one strict-successor presentation
frontier before any external effect. The same reviewer then returned
contract/theory **Accept** against exact semantic candidate SHA-256
`79F15DF094A5854C0BECE98D690DE031EAB282607C9AEFAB26124C9EA69811BB`.
It closed `G81218-CR-012..013`, confirmed `G81218-CR-001..009` remained closed,
kept `G81218-CR-010..011` replaced by the narrower closed findings, found no new
acceptance-changing issue, and reported no owner blocker. That verdict closes
only this prerequisite contract/theory layer.

## Review and implementation ordering

This is a material correction to four accepted Gate contracts. Its required
fresh, separate top-level contract/theory review is complete. Same-context
author checking and child-agent preflight were not substituted for that verdict.

The current working-tree implementation/evidence candidate is a separate review
layer. It must prove that local restore/copy and the exact allowed deletion
projection preserve Gate 5's local-only capability, Gate 8 settlement, Gate 12
terminal/identity truth, and Gate 18 cut immutability. Implementation review may
require physical correction but may not add same-home resurrection, an
incarnation, retained audit fields, a silent import/deletion default, or causal
attribution without another maintainer product decision.

Gate 22's own contract/theory candidate is no longer blocked by this
prerequisite contract verdict, but the retained Whole-Gate review sequence keeps
it downstream until the prerequisite implementation/evidence layer is accepted.
Gate 22 implementation also needs that real producer rather than a prepared
fixture.

No integration, branch, commit, publication, release, Gate 22 acceptance, or
Gate 23 authority follows from the accepted contract or the pending
implementation/evidence candidate.
