# OpenCode fork Gate 8: learning-command settlement

Status: Accepted boundary retained at corrective integration commit
`9e91d43c629b66d65c8741e342bca7cf05de5667`, except that the Session-deletion/
retention subsection is bounded-reopened by the contract/theory-accepted
[Gates 5/8/12/18 deletion-choice and local-restore correction](repa-gate-05-08-12-18-session-deletion-choice-correction-2026-08-13.md).
Its exact current implementation/evidence successor is independently accepted
under Whole-Gate run `G22-WG-20260813-019ff8e2-01` and is integrated with Gate
22 at implementation commit `ada0a04c19847ce62ae490c90838c88c51a65d72`.
Gate 22 review temporarily reopened only Gate 18's material exact-read relation
feeding the optional audit; the retained reviewer accepted the action-complete
successor at manifest `334CDCAEEA573A8257E8F3B67A8A4AE9550F06522B3E85645B974CE126C4CBE6`.
Deletion transaction, command settlement, and every other Gate 8 meaning were
unchanged.
One scoped immutable-occurrence presentation correction is pending independent
implementation/evidence closure. The 2026-07-27
first-principles audit had scoped-reopened the current physical
shared-substrate dependency and primary-TUI settlement-presentation
boundaries. The original Course-command proof at implementation commit
`293ff6892` remains historical acceptance; the corrective snapshot described
below was accepted by the original database and TUI reviewers. The earlier
fresh independent top-level contract/theory and implementation/evidence
reviews both closed with `Accept` on 2026-07-16 after all then-known findings
were resolved.

Post-close extension audit (2026-07-27): the original Course-command proof and
the shared-substrate product contract remain accepted. Later Gates expanded
the generic invocation/receipt tables into command unions, per-domain nullable
effect foreign keys, and a central settlement compositor that imports every
domain. That physical extension contradicts this Gate's narrow dependency
direction and must be corrected before another command family is added. The
repair preserves atomic effect/receipt/terminal settlement and exact replay;
it moves typed effect association back under each domain rather than reopening
the product invariant or invalidating the original Course transition.

The same audit found that the primary TUI hides generic completed-tool output
by default. Gate 8 deliberately proved an exact durable model-visible result
rather than a complete later inspection UI, but an applied Course transition
must still remain truthfully visible when provider continuation fails. The
shared semantic result projection is therefore part of the scoped repair; it
does not turn Gate 8 into Gate 22's general history browser.

Date: 2026-07-16

Parent roadmap: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Architecture: [Learning-centered system architecture](../architecture/00-system-architecture.md)
and [native learning data model](../architecture/01-native-learning-data-model.md)

Decisions: [ADR-0005](../decisions/0005-durable-turn-and-interaction-hierarchy.md),
[ADR-0006](../decisions/0006-atomic-local-learning-transaction.md),
[ADR-0007](../decisions/0007-process-local-coordination-and-finite-turns.md),
[ADR-0008](../decisions/0008-model-write-initiative-and-durable-authority.md),
[ADR-0009](../decisions/0009-separate-invocation-and-semantic-effect-identity.md),
[ADR-0012](../decisions/0012-learning-centered-modular-monolith.md), and
[ADR-0014](../decisions/0014-one-time-opencode-fork.md)

This record is the accepted Gate 8 engineering contract and closing
implementation record. It establishes the narrow shared settlement substrate
required by later model-issued learning commands and proves it with one real
Course-owned transition.

## Why this Gate exists

Gate 7 created the first native learning authority, but its application methods
do not bind a model invocation or causal learner occurrence. Most mutation
methods also return a convenient current-state read after the write transaction
has committed. A second serialized writer may commit before that read, so the
return value is not an exact operation receipt and cannot be exposed as the
model-visible result of a durable command.

The released-v1 tool path has the complementary gap. It persists a pending or
running Tool Part, executes the tool, and only later persists the completed Tool
Part when the provider stream emits a tool result. A process failure between a
Course commit and that later Part update would leave real learning state beside
an interrupted or failed model-visible invocation.

The inherited durable-event transaction is useful but insufficient as-is. Its
current commit hook runs after the event payload has been encoded and after its
projectors have run. The hook can atomically attach a result that was already
known, but it cannot derive `applied`, `already_applied`, a typed conflict, or an
exact Course result inside the transaction and then place that result into the
same completed Tool Part. Pre-reading the result would restore the race.

Gate 8 therefore adapts the mature transaction mechanism into one narrow
transaction-first settlement seam. It does not add a second runner, a
reconciler, or a universal learning event model.

## Accepted Gate result

After this Gate, one interactive released-v1 model invocation can execute one
Course-owned command whose trusted causal source, logical model operation,
physical tool invocation, semantic effect, Course transition, immutable
receipt, exact terminal Tool Part, and exact model-visible result have durable,
separate identities and one truthful failure boundary.

The shared settlement substrate owns only:

- trusted invocation admission and its canonical-input conflict check;
- the runtime-bound causal and model-operation envelope;
- physical invocation settlement and exact replay;
- immutable causal receipts and source-availability tombstones;
- transaction-first construction of the exact returned Tool Part; and
- recovery of admitted but uncommitted local learning invocations.

Gate 8 also closes two inherited Interaction prerequisites that the command
cannot truthfully bypass: stable admission identity for a learner occurrence
across copied presentation Messages, and the process-local FIFO lane already
required by ADR-0007 for current local tools. These mechanics remain owned by
the released-v1 Session/Interaction runtime. They do not become Course rules or
a second executor.

Course authority continues to own the semantic effect address, target value,
legal transition, entity preconditions, current-effect interpretation, and
correction or supersession behavior. No shared record becomes a universal
domain event, global revision, or replay source for Course state.

## First real command

The first command is a narrow non-null operation, provisionally named
`accept_course_view_revision`. It accepts one existing exact eligible Course
View Revision as the Course's working selection.

Its delegated semantic input contains:

- the exact Course ID and target Revision ID;
- the exact expected Course state version;
- the exact expected current selection target, including `null`, and selection
  version; and
- the exact expected target View and Revision state versions.

Expected versions are execution preconditions, not semantic-effect identity.
The target must be eligible and must not already be the working revision. The
command does not expose the broader Gate 7 `select` surface: it cannot clear the
selection, create or revise a Course View, reject or withdraw a target, or
select autonomously from a Tutor proposal without a current learner acceptance
source.

The causal occurrence is a generated durable learner-occurrence identity
created when a real learner input is first admitted through the released-v1
interactive prompt boundary. It is not the presentation User Message ID. The
origin presentation stores an immutable link to that occurrence; overflow
compaction replay and Session fork presentations may only copy the same link
with explicit `compaction_replay` or `fork_clone` provenance. They cannot mint
a second occurrence from copied text or newly generated Message and Part IDs.

The current parent User Message may directly request the selection or accept a
Tutor proposal. The model performs the open semantic judgment that the input
expresses that action; code does not pretend to prove arbitrary language
semantics. The runtime proves that the parent presentation belongs to the
current Session, resolves through immutable lineage to one admitted
learner-origin occurrence, and is neither synthetic nor an internal prompt. A
copied presentation therefore remains eligible only as the same cause: it can
reach semantic replay or conflict for that occurrence, never a new semantic
address.

Gate 8 does not infer admission identity for pre-Gate-8 history. A legacy User
Message without an occurrence link, including an already-created compaction or
fork copy, cannot authorize a learning command; a new admitted learner input is
required. Migration does not guess lineage from text, timestamps, Message IDs,
or `synthetic` absence.

This command is a routine reversible local learning write. A direct current
learner request is not followed by a redundant confirmation dialog. Existing
execution permission may still deny the capability, and prompt text alone
cannot grant it.

Selecting a Revision creates no new claim about that Revision's authorship or
source. Gate 7 `authorship_basis` remains creation provenance. The Gate 8
receipt records a separate selection acceptance occurrence.

### Why not another Course command

`Create Course` is smaller in code but not causally sufficient. It has no
existing entity target or real stale precondition, and its generated identity
does not supply a natural semantic slot for a resampled physical invocation.
Using title, payload hash, provider call ID, or a global LearnerHome revision as
the effect address would contradict accepted identity and revision rules.

Creating or revising a View has a real stale predecessor but would also import
generated View, Revision, and item identities, hierarchy and mapping rules,
authorship basis, and proposal-slot questions. Candidate formation also does
not prove learner acceptance. Those are valid later command consumers, not the
smallest honest proof of the shared seam.

The selected command changes one existing versioned Course-owned slot while
exercising learner acceptance, stale target and ABA rejection, physical and
semantic replay, and exact committed results.

## Identity and trusted envelope

Gate 8 maps the accepted logical identities onto the released-v1 production
records as follows, without claiming that this completes the eventual Turn
schema:

| Meaning                   | Gate 8 identity                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| causal learner occurrence | generated admitted-occurrence ID plus immutable origin Session/User Message identity; the current parent presentation resolves to it through durable lineage       |
| logical model operation   | the persisted Assistant Message ID created for one released-v1 provider sample; its `parentID` is a linked presentation of the causal occurrence                   |
| physical invocation       | the host-generated Tool Part ID, correlated by the exact Assistant Message ID and non-empty provider `callID`; emission ordinal is ordering metadata, not identity |
| semantic effect           | a Course-owned acceptance effect with address `(admitted occurrence ID, Course ID, working-selection acceptance slot)`                                             |
| exact result              | the terminal Tool Part state and its bounded structured settlement stored by the invocation                                                                        |

The Assistant Message mapping is deliberately local to tool-bearing
released-v1 samples. It does not declare an Assistant Message to be a complete
learner Turn or settle the remaining physical Interaction design.

The model cannot supply or override occurrence ID or lineage, Session ID, User
Message ID, Assistant Message ID, Part ID, provider call ID, emission ordinal,
capability identity/version, permission admission, invocation time, settlement
time, or semantic-effect ID. The common interactive Session tool binding
obtains them from the runtime and verifies their relationships against durable
rows.

The physical invocation fingerprint covers the normalized model payload,
command and schema version, and trusted identity envelope. A digest may be used
for equality and conflict detection, but it is never the invocation identity,
semantic-effect address, or provenance.

The Tool Part ID and `(Assistant Message ID, callID)` identify one physical
call. Both mappings are unique. A retry cannot reserve another Part ID for the
same tuple, and a provider call ID has no meaning outside its Assistant Message.
Learning commands reject a missing or mismatched call ID rather than falling
back to Session order or payload equality.

One Assistant Message may apply at most one new durable learning mutation. A
new physical invocation for the same already-applied semantic effect may settle
as a duplicate; another distinct mutation from the same model operation fails
with `context_refresh_required`. A later Assistant Message can observe the
first commit and decide again.

### Process-local causal-order lane

Every program-executed tool exposed by the current released-v1 interactive
Session binding uses one process-local FIFO lane owned by the active
Session/Turn processor. Built-in, plugin-provided, and MCP-backed local tool
executions use the same outer wrapper; provider-executed tools that the local
runtime does not execute are outside this lane.

The outer synchronous `execute` entry registers each provider-emitted call and
fixes a monotonic ordinal before creating a Promise or Effect and before any
plugin hook, permission wait, or tool body can yield. It also reserves the host
Part identity used by the processor. The AI SDK may start several execution
Promises, but their closures enter this lane in registered order. Call B cannot
run a hook, request permission, read durable state, or settle before earlier
call A has reached a terminal result. The ordinal is retained as audit and
ordering metadata; it is not a replay key or semantic identity.

The lane is common Interaction machinery, not a Course-command queue or second
runner. It is not reconstructed after restart. A reserved call that never
reached durable command admission follows ordinary interrupted Tool Part
recovery; a durably admitted learning invocation follows the recovery rule
below.

## Owned record families

Exact SQL and TypeScript names may change, but the implementation keeps these
meanings distinct.

1. **Admitted learner occurrence and presentation lineage.** An
   Interaction-owned generated occurrence ID, immutable origin Session/User
   Message identity and trusted admission time contain no transcript text.
   Each eligible User presentation has an immutable transcript-owned link to
   that occurrence and records whether it is the origin, a compaction replay,
   or a fork clone. Only the interactive admission boundary creates an origin;
   copy paths can only reference one. A missing link is not reconstructed.
2. **Physical learning-command invocation.** The host Part ID, Session,
   Assistant Message and provider call correlation, command/schema version,
   emission ordinal, canonical-input fingerprint, trusted admission and
   settlement times, terminal status, exact success or error settlement, and
   optional link to the admitted semantic effect. Several physical invocations
   may link to one effect while their originating transcripts exist.
3. **Immutable causal receipt.** A generated receipt ID, the admitted
   occurrence and its original Session/User Message identities, first
   admitting model operation and physical invocation, capability and
   authorization basis, trusted commit time/order, and link to the Course-owned
   effect. It stores no transcript text or Course payload and has no update
   path.
4. **Course working-selection acceptance effect.** A generated Course-owned
   effect ID, receipt link, semantic address, exact accepted Revision, previous
   selection target/version, and exact committed selection target/version. Its
   address is unique per causal occurrence and Course. Its current `active` or
   `superseded` relation is derived by comparing both the current selection
   target and its monotonic version with the effect's exact committed pair; a
   later transition never rewrites the original receipt.
5. **Causal-source availability tombstone.** A monotonic companion to the
   admitted occurrence, not a mutable field on the receipt. Absence means the
   original admitted presentation remains available. Any supported deletion of
   that origin atomically records `source_unavailable` plus trusted deletion
   time before the presentation disappears. It stores no transcript content
   and has no transition back to available. This also protects an occurrence
   whose fork clone remains before any receipt exists.

Receipt, effect, and the first `applied` physical settlement that supports them
do not use inherited Session, Message, or Part rows as cascade-owning parents.
The application validates those live rows transactionally before first
admission and retains their minimal opaque identities and exact applied result
after transcript deletion.

A terminal failed invocation, semantic conflict, context-refresh rejection,
permission rejection, interruption, or `already_applied` duplicate creates no
new independent learning state. Its transcript lifecycle owner is the persisted
Assistant model operation inside its Session, not the Tool Part presentation.
While that Assistant exists, the invocation and exact settlement remain
durable and continue to occupy both Part ID and `(Assistant Message ID, callID)`
uniqueness. A Part-only delete cannot release those replay keys.

After no live processor owns the Session, deleting the entire owning Assistant
Message, including through a full-message revert cleanup, atomically deletes
its no-effect invocations and Parts. Whole Session deletion does the same. The
original effect, receipt, and first applied settlement remain. There is no
optional retention branch across deletion of the owning Assistant/Session and
no earlier Part-owned deletion branch.

An occurrence record is deleted when it has no presentation link, surviving
physical invocation, or receipt/effect reference. Otherwise it survives
without content; if its origin presentation was deleted, its tombstone survives
with it. Deleted Sessions expose no retained invocation through a live
executor.

The acceptance effect is explicit command history introduced by Gate 8, not
Gate 7's previously absent hidden adoption history. It is queryable by exact
receipt/effect identity. It does not turn all Course changes into events or
require a general Course-history projection.

## Transaction-first settlement

A model-issued local learning command uses a short two-transaction state
machine. No SQLite write transaction remains open while a human permission
decision is pending:

```text
synchronously register emission ordinal and reserve the typed Tool Part
-> wait for this call's turn in the common process-local FIFO lane
-> open a short reservation/admission IMMEDIATE transaction
   -> check exact physical replay/conflict
   -> for a physically new call, validate the trusted envelope and admitted-occurrence lineage
   -> insert the invocation as admitted when physically new
   -> check Course semantic duplicate/conflict
   -> check the one-mutation model-operation slot for a genuinely new effect
   -> atomically settle any replay, duplicate, conflict, or occupied-slot result
   -> otherwise commit one genuinely-new candidate
-> if terminal, return the already-persisted result
-> run permission outside every SQLite transaction while retaining the lane
-> open the final IMMEDIATE settlement transaction
   -> reload and check exact physical replay/conflict
   -> rederive Course semantic duplicate/conflict
   -> recheck the one-mutation model-operation slot
   -> if the effect is still new, consume the permission outcome
   -> if allowed, validate current source and Course preconditions
   -> apply the Course selection and capture UPDATE ... RETURNING
   -> write Course effect and immutable receipt when new
   -> construct the exact applied/already-applied/error settlement
   -> settle the physical invocation
   -> project and store the exact terminal Tool Part and durable event
-> commit and return the already-persisted exact result to the provider
```

The reservation transaction performs semantic and mutation-slot preflight only
to avoid an unnecessary permission request. The final transaction repeats all
decision-changing reads. A permission wait cannot freeze stale state. If
another invocation commits the same effect while permission is pending, the
waiter's final transaction returns `already_applied` before considering the
captured deny or stale result. A conflicting payload still conflicts, and a
different mutation that consumed the model-operation slot still yields
`context_refresh_required`.

Allow, deny, correction, user cancellation, and abort are captured as bounded
process-local permission outcomes and consumed exactly once by the final
transaction. If the candidate remains genuinely new, every non-allow outcome
becomes an exact durable terminal error in the same invocation/Part/event
settlement path. Pending approval is not reconstructed after restart. An exact
reentry while the live lane still owns a nonterminal invocation joins that
process-local result rather than running permission or the domain command
again; after owner loss, recovery settles it as interrupted.

The transaction callback must be able to produce the final event/Part payload
from values read or written inside that same transaction. The current one-way
Event commit hook is not sufficient because it receives an already encoded
payload and returns no result. Gate 8 may narrowly extend the inherited Event
transaction mechanism or add a Session-owned transaction-first Part settlement
entry point, but it must reuse the existing projection and durable-event
authority rather than manually maintain a second Part/event path.

The Course transition participates in the final settlement transaction and
returns its exact `UPDATE ... RETURNING` value. The command does not call the
existing post-commit convenience read. Course owns the transaction-scoped
selection logic; the shared settlement substrate does not duplicate its
eligibility or CAS rules, and Course does not import Session, provider, or
terminal services.

The Tool executor returns a marker or equivalent contract indicating that the
result has already been durably settled. After any success or error settlement,
the later provider tool-result or tool-error event may exact-match and no-op; it
cannot update or recreate the Part a second time. A different result is an
internal consistency failure, not a last-write-wins overwrite.

Generic mutable tool-output hooks and truncation cannot run after a successful
learning commit and change what the model sees. Pre-admission hooks may deny
execution under their existing authority, and post-commit observers may be
notified without authority to rewrite the result or turn a committed success
into an error. The first command's exact result is closed, bounded, contains no
attachments, and remains below the ordinary tool-output limit.

## Replay and conflict order

Both admission preflight and final settlement preserve this decision order for
a trusted live invocation envelope; the final transaction is authoritative:

1. If the physical invocation is already terminal and its complete envelope
   and canonical input match, return its stored exact result without a new
   event, time, receipt, or domain read.
2. Reuse of the same Part ID or `(Assistant Message ID, callID)` with a
   different tool, envelope, or canonical input is an invocation conflict and
   cannot modify the original settlement.
3. Resolve the current parent presentation to its admitted occurrence and
   derive the Course-owned semantic address from that occurrence ID and Course.
   If an effect exists with the same exact Revision value, settle the new
   physical invocation as `already_applied` before evaluating source
   availability, permission, or stale execution versions. Do not advance the
   selection version or replace first-admission provenance.
4. If the address exists with a different Revision value, settle a semantic
   conflict. A new learner occurrence or an explicit later correction is
   required.
5. If the effect is genuinely new, enforce the one-mutation model-operation
   slot. Only an open slot proceeds to permission. In the final transaction,
   recheck the preceding decisions, then consume the permission outcome and
   validate source availability, exact Course/selection/View/Revision versions,
   target eligibility, and the non-working target rule before applying the
   transition.

For an initial application, the exact success result contains at least:

- `applied` outcome;
- receipt and Course effect identities;
- exact Course and accepted Revision identities;
- previous and committed working-selection targets and versions; and
- the trusted settlement time/order.

For a semantic duplicate, the exact success result contains at least:

- `already_applied` outcome;
- the original receipt/effect and committed-selection result;
- the current exact selection target/version read in the duplicate's
  transaction; and
- whether the original effect is currently `active` or `superseded`. It is
  active only when both target and version equal the original committed pair;
  selecting away and later returning to the same Revision does not reactivate
  the older effect.

A physical replay returns its original result exactly; it does not refresh the
current-effect projection. A new physical duplicate receives a new exact
settlement describing current state without changing the original effect.

Typed permission, cancellation, stale, inactive, source-unavailable,
semantic-conflict, context-refresh, and validation failures have bounded exact
error settlements. Once a physical learning invocation has been admitted, its
terminal success or error is durable and replayable while its transcript
exists. A process that exits with an admitted nonterminal invocation never
executes it during recovery; startup settles it as interrupted with no Course
effect or causal receipt.

Trusted times cannot precede the occurrence admission, current parent
presentation, model operation, physical admission, or consumed Course state.
Exact replay retains the stored times. Any local commit order used to establish
this floor is ordering and audit metadata only; it is not a global stale-write
revision.

## Settlement-aware transcript mutation boundary

Gate 8 makes the lowest common Session Message/Part mutation path aware of
occurrence lineage and command settlements. HTTP Message/Part handlers,
provider completion, revert cleanup, compaction replay, Session fork, and whole
Session deletion use this boundary; none may publish a lower-level Message or
Part mutation event to bypass it. The boundary remains
Session/Interaction-owned and consults the settlement records only to preserve
their invariants.

The legal mutations are:

- An occurrence-linked User presentation keeps immutable identity, lineage,
  and admitted content. An exact Message/Part update is a no-op; a
  content-changing update or deletion of only one constituent Part is rejected.
  This applies before and after a receipt exists, so a copied presentation
  cannot be edited into a new assertion while retaining the old cause.
- Updating any settlement-linked terminal learning Tool Part with its exact
  stored bytes is a no-op. Any different update is an immutable-settlement
  conflict. Ordinary provider completion and post-tool hooks use the same rule
  for applied and no-effect results.
- Deleting an original effect-supporting Part or its Assistant Message through
  Part/Message delete or revert is rejected before any transcript mutation.
  Whole Session deletion is the one ordinary exception because it follows the
  explicit retention and tombstone transaction below.
- Deleting a settlement-linked no-effect Part by itself is rejected while its
  owning Assistant Message exists. Once no live processor owns the Session,
  deleting that entire Assistant Message, including through revert, atomically
  removes all its no-effect invocation rows and Parts through the existing
  projection/event transaction. This releases Part and Assistant/call keys only
  with the complete physical call ownership aggregate; whole Session deletion
  has the same effect.
- Deleting the complete origin User presentation is allowed only in the same
  transaction that creates its monotonic `source_unavailable` tombstone.
  Deleting a complete replay or fork-clone presentation removes only that
  presentation link and never changes occurrence identity or availability.
  If a physical invocation still references the occurrence, origin deletion
  retains the occurrence and tombstone until that invocation's owning
  Assistant/Session is also deleted.
- Revert computes and validates its complete cleanup set first. If it includes
  a protected original applied Part or only a settlement-linked no-effect Part,
  the revert fails without deleting anything. Otherwise the selected complete
  Message removals, required origin tombstones, Assistant-owned no-effect
  invocation removals, projections, and deletion events commit as one
  transcript mutation rather than a sequence that can stop halfway.
- Overflow compaction creates a new presentation link to the existing
  occurrence in the same transaction as the replay User Message. Session fork
  does the same for each linked User Message. It never infers lineage for a
  legacy unlinked Message.
- A forked copy of a settlement-linked Tool Part is an explicit read-only
  historical presentation reference to the original Part and settlement. The
  clone Part and its provenance are created together; no physical invocation
  row is minted for the clone, its new IDs are not replay keys, and command
  replay through the clone returns `historical_reference` rather than posing as
  an invocation in the fork. Removing that clone presentation does not remove
  the original settlement.

These checks live below the individual HTTP routes and cleanup helpers because
those are multiple callers of one invariant. This is not a general transcript
versioning framework and does not make immutable all ordinary Messages or
Parts.

## Session deletion and source-unavailable tombstone

Current correction notice (2026-08-13): the following clauses remain exact
provenance for the accepted implementation and for independently required
command effects/receipts. Their rule that presentation lineage is always
removed now has one contract/theory-accepted optional-retention correction: the
learner may
choose to retain only the allowlisted body-free Context/read/citation/terminal
audit. No other Gate 8 settlement meaning is reopened.

Ordinary Session deletion does not undo, replay, or deep-delete an accepted
Course selection. For each deleted Session it must atomically:

- tombstone each admitted occurrence whose origin presentation is removed and
  remains referenced by a receipt, surviving clone, or physical invocation not
  removed in the same transaction, while retaining only opaque non-content
  origin identity; delete an occurrence instead when no presentation,
  invocation, or receipt/effect reference remains;
- preserve Course acceptance effects, immutable receipts, and each effect's
  first exact `applied` settlement record;
- remove Session-, Message-, Part-, and durable Session-event bodies plus all
  non-allowlisted presentation lineage. Full deletion removes every optional
  inspection association; minimal-audit deletion may retain only the candidate
  body-free Context/read/citation/terminal projection once the bounded
  correction's implementation/evidence is independently accepted. Failed,
  interrupted, rejected, conflicting, or duplicate physical invocation bodies
  owned by an Assistant in that Session are still removed; and
- publish deletion visibility only after the database transaction commits.

An explicit same-home import-as-copy under that correction never reconnects the
new Session to an old command occurrence, physical invocation, immutable
receipt, effect, or source tombstone. Those records retain their original
identity and deletion/source-unavailable truth; imported presentations are not
evidence that the old command ran again.

The current publish-then-remove path and catch-and-log failure behavior are not
sufficient for this claim. A failed tombstone or transcript/aggregate deletion
must be observable and must not report successful deletion with a mixed source
availability state. Gate 8 adapts this one local database boundary; it does not
define cross-authority learning deep deletion or an all-or-none transaction for
an entire parent/child Session tree. The atomic claim is one Session aggregate
and the occurrence, invocation, receipt, and settlement rows affected by that
deletion.

Deleting an invocation Session does not itself tombstone a causal occurrence
whose origin presentation lives in another Session. Conversely, deleting an
origin Session tombstones that occurrence even if a fork presentation remains;
the clone then resolves to an unavailable cause and cannot authorize a new
effect. A no-effect physical invocation that survives in another Session also
retains the tombstoned occurrence until its owning Assistant/Session is
deleted; exact physical replay still precedes the unavailable-source check.

After transcript deletion, the independently required receipt and first applied
settlement remain inspectable correction evidence. They are distinct from the
learner-selected optional Session audit. No active executor can present the
deleted Session/Part as a live trusted envelope, so the command replay API does
not resurrect or continue that invocation. Read-only inspection can return the
stored result and its source-availability status, plus only the optional audit
fields the selected mode separately permits.

## Runtime and dependency ownership

- The common released-v1 interactive Session tool binding owns occurrence
  admission/presentation lineage, synchronous emission registration, and the
  process-local FIFO lane. It supplies trusted occurrence, Session,
  User/Assistant Message, Part, call, Agent/capability, permission, and clock
  context. Public or hidden Agent presentation metadata grants no alternate
  authority.
- Narrow internal title, compaction, and project-copy model operations do not
  receive the learning command. Compaction and fork do use the common lineage
  and historical-presentation APIs so that copied records cannot create causal
  or physical identities.
- A Repa command-settlement module owns shared invocation/receipt mechanics and
  the transaction-first Part seam. It may depend on native database, identity,
  and Interaction primitives, but it owns no Course transition meaning.
- Course authority owns the acceptance effect address, transition-scoped
  selection operation, effect record, current-effect projection, and typed
  domain errors. It imports no provider, AI SDK, Session service, or terminal
  code.
- The outer application binding composes the shared settlement and Course
  command. The Session processor recognizes already-settled results and cannot
  overwrite them.
- One Session-owned transcript mutation boundary protects admitted-occurrence
  origins and settlement-linked Parts for HTTP mutation, revert, compaction,
  fork, provider completion, and Session deletion. Projectors remain the
  existing database authority and are not a public bypass.
- Preview-v2 source remains hibernated. Its Event transaction is mechanism
  evidence only; Gate 8 neither enables its runner nor creates a v1/v2 adapter.

Package placement may change if the actual dependency graph shows a narrower
boundary with the same direction. It may not move Course legality into the
processor or model invocation identity into the Course module.

## Failure behavior

- An unlinked legacy, invalid, synthetic-only, internal, or unavailable causal
  occurrence; wrong Session/parent lineage; missing call ID; unreserved Part;
  or forged runtime identity fails before a new Course effect. Compaction and
  fork copies resolve to the original occurrence rather than passing as a new
  cause.
- Calls register and execute in FIFO order. If earlier call A is blocked in a
  hook or permission wait, later call B cannot read, mutate, or settle first.
- A crash before command admission leaves only ordinary pending Interaction
  state. A crash after admission but before settlement is recovered as a
  durable interrupted invocation and is never redispatched.
- Permission allow, denial, correction, and live cancellation all reach one
  durable final settlement path. A crash while permission is pending discards
  the process-local approval channel and recovers the admitted invocation as
  interrupted; it never reconstructs or re-asks the approval.
- Any failure after the Course update begins rolls back the Course selection,
  Course effect, receipt, invocation terminal state, Tool Part projection,
  event sequence, and durable event together.
- A commit followed by process failure before the SDK consumes the return is a
  completed command. Recovery and exact replay return the stored result and do
  not repeat the transition.
- Same-effect concurrency produces one new effect; another invocation settles
  as an identical semantic duplicate. Different target values for the same
  semantic address conflict.
- A genuinely new stale effect fails against exact Course, selection, View, or
  Revision state. Withdrawal/restoration ABA remains stale because Gate 7's
  independent state versions are retained.
- A second distinct mutation from one Assistant Message fails with
  `context_refresh_required`; a duplicate of its already-applied effect remains
  replayable.
- A later learner occurrence may accept another Revision. The earlier receipt
  and committed result remain immutable and its current relation becomes
  `superseded`; selecting the earlier Revision again under a still later
  occurrence does not reactivate that old effect because selection version has
  advanced. No authorship or source claim is rewritten.
- Message/Part delete, revert, compaction, fork, provider completion, and
  Session deletion cannot bypass occurrence or settlement immutability.
  Session deletion failure is reported truthfully. Successful deletion keeps
  the Course effect, receipt, first applied settlement, and required occurrence
  tombstone while removing transcript-owned invocations and content.

## Explicit non-goals

- no Course creation, View/revision authoring, selection clearing, candidate
  rejection, withdrawal, restoration, or general Course command catalog;
- no source/artifact/revision authority, source-grounded Course claim, Material
  Map, or alignment work from Gates 9–12;
- no generic Course discovery tool, default Course preference, prompt/context
  projection, routine target selection, or TUI surface from later Gates;
- no full Turn schema, universal model-operation rewrite, provider retry
  engine, durable inbox, resumable approval, or preview-v2 execution path;
- no universal semantic-effect table, global domain revision, event-sourced
  Course authority, command bus, workflow engine, or reconciliation daemon;
- no external file/network effect settlement; and
- no learning-state deep deletion or automatic reversal when a transcript is
  deleted.

The closing trace may seed exact Course IDs and versions to exercise the real
released-v1 tool path. That proves settlement mechanics without claiming that
ordinary Tutor context already discovers the target; Gate 14 owns routine
context and continuation.

## Closing evidence

Evidence must be able to falsify the boundary rather than merely show rows were
inserted:

- the forward migration upgrades a Gate 7 database without changing existing
  Course or Session data, does not fabricate occurrence lineage for legacy
  history, and leaves fresh/upgrade schemas equivalent;
- a newly admitted released-v1 learner input receives one host-generated
  occurrence ID and origin presentation link before its provider sample; a
  legacy unlinked, mismatched, missing, synthetic-only, internal, unavailable,
  or model-supplied substitute cannot authorize the command;
- identical text in another newly admitted learner input receives another
  occurrence ID, while an actual overflow-compaction replay retains the
  original occurrence despite new Message/Part IDs;
- a forked User presentation retains the original occurrence and cannot create
  a second semantic address; deleting the original source makes a surviving
  clone unavailable for a new effect;
- a forked completed learning Tool Part has explicit historical-clone
  provenance, no physical invocation row, and cannot replay as a fork-local
  invocation;
- two distinct learning-mutation calls from one Assistant Message are
  deliberately emitted in order while call A is blocked before or during
  permission; call B cannot run or settle first, so A applies the only new
  mutation and B then settles `context_refresh_required`;
- one learner-directed acceptance commits the exact Gate 7 selection result,
  Course effect, immutable receipt, physical settlement, completed Tool Part,
  projection, and durable event in the final transaction;
- exact physical and semantic replay terminate before permission; permission
  allow, deny, correction, and cancellation each produce one durable terminal
  settlement, and a semantic duplicate committed during a permission wait wins
  over the captured permission or stale result in the final recheck;
- the persisted and immediate provider-visible result are exactly the bounded
  result produced from the transaction, not a Gate 7 post-commit convenience
  read or a plugin-rewritten value;
- failure injection after each write boundary leaves no partial Course effect,
  receipt, invocation settlement, Part projection, event row, or advanced event
  sequence;
- process exit after invocation admission, including during permission, but
  before terminal commit recovers to a durable interrupted error without
  execution or re-asking; exit after commit but before provider consumption
  reopens to the stored success;
- an exact physical replay returns the stored success or error without a new
  event or state change, while conflicting reuse of Part or Assistant/call
  identity fails without altering the first settlement;
- a new Part/call for the same cause, Course, and Revision settles
  `already_applied` before stale checks, preserves first provenance, and does
  not advance selection version;
- the same semantic address with another Revision conflicts, while a genuinely
  new causal occurrence remains eligible for a later explicit acceptance;
- stale current selection, Course, View, Revision, and withdrawal/restoration
  ABA cases reject a new effect atomically;
- two distinct durable mutations from one Assistant Message reject the second,
  while a later sample can observe state and decide again;
- concurrent first admission of the same semantic effect yields one applied
  effect and one duplicate settlement rather than two selection advances;
- a later accepted selection leaves the original receipt/result intact and
  makes its current relation `superseded`; selecting away and back to the same
  Revision proves that target equality cannot reactivate the older effect;
- update of an occurrence-linked User Message/Part exact-matches as a no-op,
  changed content conflicts, and partial Part deletion is rejected so lineage
  cannot authenticate edited presentation content;
- after a no-effect terminal settlement, Part-only delete is rejected; a
  subsequent provider completion exact-matches as a no-op and exact reentry
  returns the stored settlement under the original Part and Assistant/call
  keys. Applied terminal Parts obey the same immutable update/delete rule, and
  any changed bytes conflict;
- whole-Message delete or revert still rejects removal of an original applied
  Part, but after the Session is not busy it may atomically delete a complete
  Assistant model operation and all of that Assistant's no-effect invocations;
- HTTP Message delete and revert of an occurrence's origin atomically create
  its tombstone, while deleting only a clone presentation leaves origin
  availability unchanged; if a failed invocation Assistant/Part survives, the
  occurrence and tombstone also survive and physical replay still returns its
  exact settlement;
- deleting the final owning Assistant or whole Session removes failed,
  interrupted, rejected, conflicting, and duplicate invocation rows; an
  occurrence/tombstone with no remaining presentation, invocation, or
  receipt/effect reference is then removed, while only the first `applied`
  settlement crosses Session deletion;
- successful Session deletion removes Session/Message/Part, lineage, no-effect
  invocation, and Session-event content; tombstones each removed origin still
  referenced elsewhere; and preserves the Course selection, acceptance effect,
  immutable receipt, and first exact applied settlement after reopen;
- injected tombstone or transcript/aggregate deletion failure is reported and
  cannot leave a falsely successful mixed deletion state;
- mutable post-tool hooks, provider result callbacks, and ordinary processor
  completion cannot overwrite or contradict an already-settled learning Part;
- the affected Course, database migration, Event, Session tool/processor,
  replay/recovery, and deletion tests pass from their owning packages; and
- affected package typechecks and the migration generator check pass.

The evidence does not require a monorepo-wide suite, an unrelated provider
campaign, a full learner-facing Course UI, or later learning-authority tests.

## Implementation result

Implementation commit `293ff6892` realizes this contract across the existing
Core, Event, released-v1 Session, permission, tool, and public protocol owners:

- `packages/core/src/learning-command` owns immutable admitted learner
  occurrence lineage, physical invocation and semantic-effect identity,
  receipts, exact settlement, replay/conflict order, source-unavailable
  tombstones, and the Course-owned acceptance transaction;
- the Gate 8 migration and generated schema add the corresponding constrained
  record families while preserving Gate 7 upgrade and fresh-schema equivalence;
- the existing Event transaction authority now commits settlement-linked Part
  and Event visibility without allowing a post-commit observer failure to
  rewrite the caller-visible committed result;
- `packages/opencode/src/learning-command` and
  `accept-course-view-revision.ts` bind the trusted released-v1 invocation
  envelope, permission state machine, single-flight reconciliation, exact tool
  input, and model-visible result to the Core settlement;
- the common local-tool binding fixes FIFO registration before asynchronous
  hooks, while Session lifecycle, transcript mutation, compaction, fork,
  revert, and deletion paths preserve occurrence, invocation, historical
  presentation, and immutable terminal-Part truth; and
- both ordinary runner entry and shell entry use the same Session lifecycle
  handoff. Registration and cancellation run outside its non-reentrant control
  section while a read lease prevents whole-Session deletion from committing
  before admitted cleanup completes.

The original independent reviewer task
`019f68d9-5853-7e23-8592-dc41b90ac9bb` accepted the implementation/evidence
after iterative counterexamples closed runtime-before-presentation replay,
admitted-Part immutability, Session deletion and fork races, post-commit result
reconciliation, public Busy/NotFound behavior, and the final late-runner cleanup
deadlock. Its final direct replay observed the interrupt cleanup re-enter the
same Session, the admitted call return `interrupted`, deletion return `deleted`,
and lifecycle phase become `closed`.

Focused closure evidence covered Core settlement and migration behavior; exact
Course CAS/ABA; Event commit, rollback, and visibility; runtime replay,
permission, hooks, processor interruption, and recovery; HTTP and generated
protocol behavior; Session mutation, compaction, fork, revert, and deletion;
and deterministic lifecycle races. The final reopened lifecycle boundary passed
31 Lifecycle/Runner tests with 90 assertions plus the real prompt interleaving
with seven assertions. Core and OpenCode typechecks, the migration generator,
formatting, link, and diff checks passed. Windows-only real shell execution
remained platform-skipped; the shared handoff seam and direct Runner shell
cancel/Stopping evidence closed the relevant invariant without promoting that
skip into a green result. No unrelated monorepo-wide suite was required.

## Review closure

Before any production implementation, a fresh top-level reviewer must inspect
this contract against the product origin, ADRs 0005–0009/0012/0014, Roadmap 09,
the native learning data model, Gate 7's accepted contract and implementation,
and the released-v1 runtime evidence.

The review should try to falsify at least these claims:

- non-null exact Revision acceptance is the smallest causally sufficient first
  command and does not overclaim learner-language proof;
- the Assistant Message, Tool Part, and call correlation preserve distinct
  model-operation and physical-invocation meanings;
- stable admitted-occurrence identity survives compaction and fork presentation
  copies without suppressing a genuinely new learner input or permitting a
  copied input to create a second semantic address;
- a transaction-first Part/event seam is necessary and remains narrower than a
  second runner or universal transaction framework;
- the common local-tool FIFO plus the two-transaction permission state machine
  preserve causal order, replay precedence, one-mutation-per-sample behavior,
  and exact post-commit SDK handling; and
- the shared transcript mutation boundary covers every reachable update,
  delete, revert, compaction, fork, provider-completion, and Session-deletion
  path without importing learning deep deletion.

Same-context author preflight and child investigations do not satisfy this
transition. The original top-level reviewer closed every contract/theory
finding and returned `Accept` on 2026-07-16, then closed every
implementation/evidence finding and returned final `Accept` after the
implementation was corrected. `docs/README.md` records the resulting Gate
closure. A later material contract revision reopens this review obligation.

## Design evidence provenance

The grill used the current production fork plus these fixed references:

- OpenCode `v1.17.18` at
  `b1fc8113948b518835c2a39ece49553cffe9b30c`, especially the released-v1
  Session tool/processor path and the hibernated Event transaction mechanism;
- Codex `rust-v0.144.1` at
  `44918ea10c0f99151c6710411b4322c2f5c96bea`, only as a secondary comparison
  for call/result correlation and non-redispatch recovery; and
- immutable pre-fork Repa oracle
  `db1ffdc4c84d52299c96e25121a776f7720ff9f2`, only for atomic settlement,
  semantic replay/conflict, orphan recovery, and Course-boundary
  counterexamples.

The fork adapts demonstrated invariants, not reference package topology,
preview-v2 production authority, oracle tables, or old command APIs.

## 2026-07-28 corrective integration

The corrective snapshot separates the physical learning-command ledger from
domain semantics. The physical owner retains admission, invocation, receipt,
replay, recovery, terminal, and deletion behavior without importing or
enumerating Course, Representation, Navigation, Retained Steering, or Goal.
Each domain owns reservation, effect/seal, legal terminal variants, and a
recursive decoder before returning a typed settlement. The migration reuses
those same decoders, and generic recovery returns an honest open
`PhysicalSettlement`.

One versioned capability-specific semantic Part is now produced inside the
committing transaction and consumed by TUI and direct-run. Its binding is
checked against the actual PermissionRequest, completed ToolPart, command,
outcome, error code, and durable-settlement envelope; a later provider failure
cannot hide or rewrite the committed result. Representation's v12 failure
vocabulary has one frozen domain owner from which its public TypeScript type,
recursive validator, and trigger SQL are derived.

The original database and TUI reviewers independently accepted the corrected
physical/domain direction, recursive replay and migration validation, exact
presentation binding, and post-commit visibility. Final shared-tree evidence
included Core 100/100, Schema 2/2, TUI 26/26, OpenCode 400/400, all four
affected package typechecks, and `git diff --check`.

Commit `9e91d43c629b66d65c8741e342bca7cf05de5667` durably fixes the
independently accepted shared-tree snapshot and closes this scoped reopen. The
original Course settlement proof remains historical acceptance.

## 2026-07-31 immutable occurrence-presentation correction candidate

Gate 14's real OAuth/model qualification found one implementation violation of
the already accepted Gate 8 immutability boundary. Inherited
`SessionSummary.summarize` computed file diffs after tool execution and wrote
them into `UserMessage.summary.diffs`. Once that User Message has admitted a
learning occurrence, Gate 8 freezes its exact presentation bytes. The derived
summary update therefore failed with `InvalidCausalSourceError` after the
default-Course effect itself had correctly committed, turning an otherwise
successful real Turn into owner failure.

The first correction moved the derived view to the mutable current Session
summary and recomputed an older message's view from its anonymous Snapshot
trees. Independent review rejected that candidate as `G8-IMM-001`: a later
Turn replaces the current Session summary, and Snapshot cleanup may prune the
unreferenced Git trees. The same older message could therefore return a real
non-empty diff before cleanup and the false empty array afterward.

The superseding candidate gives the derived fact a durable owner without
rewriting the immutable presentation:

- `message.summary_diffs` is a Session/Interaction-owned projection beside,
  not inside, the legacy Message `data` bytes. Updating the current Session
  summary commits the exact per-message projection in the same EventV2
  transaction while the owning Turn is still running. A terminal old Turn
  cannot overwrite a successor's current Session summary.
- A message-specific diff request reads that durable projection first, then a
  historical `UserMessage.summary.diffs` projection, and only then uses
  Snapshot recomputation as a best-effort fallback. A request without a
  Message ID still returns the current Session summary.
- Forward migration `20260731120541_gate08_message_diff_projection` advances
  the native database from V14 to V15, adds the nullable projection, and
  backfills exact historical diff arrays without deleting or rewriting the
  legacy Message bytes. Fresh and all historical upgrade paths converge on the
  same current schema and migration lineage.
- Fork materialization copies the exact per-message projection to the cloned
  User Message. It remains available after the source Session is deleted; an
  ordinary Message deletion still removes the projection with its owning row.
- Existing Prompt and Processor summary timing is unchanged. The correction
  neither adds a queue/retry path nor reopens Gate 12 owner handoff.

The causal regression uses two real tool Turns. It proves that U1 and U2 have
distinct non-empty diffs, U2 becomes the current Session summary and emitted
`Session.Diff`, U1's exact backing Snapshot objects then become unavailable,
and the U1 API still returns its preserved value. U1's Message presentation
remains byte-stable and `Occurrence.requireAvailableSource` still validates it.
A separate fork oracle proves that the same projection survives source-Session
deletion.

Fresh candidate evidence:

```text
Core database migration                         40 pass / 355 assertions
Core typecheck                                  pass
Core migration --check                         pass / no drift
OpenCode Session lifecycle                      34 pass / 237 assertions
OpenCode Prompt lifecycle                       14 pass / 111 assertions
OpenCode Processor lifecycle                    30 pass / 158 assertions
message diff + real U1/U2 Snapshot regression    3 pass / 22 assertions
```

The OpenCode package typecheck has no candidate-path diagnostic; it still
reports only the unchanged `specs/fixtures/tui-plugins/tui-smoke.tsx`
implicit-any and obsolete workspace-property diagnostics. The physical ledger,
domain settlements, replay, deletion, typed terminal projection, and accepted
Gate 12 timing remain unchanged.

This is a scoped, unstaged implementation/evidence candidate. `G8-IMM-001`
must close in the original independent reviewer task before integration or a
Gate 8 closure claim. The new V15 predecessor will also require the accepted
Gate 16 contract's migration numbering to be rebased before any Gate 16
implementation; it does not authorize that implementation here.
