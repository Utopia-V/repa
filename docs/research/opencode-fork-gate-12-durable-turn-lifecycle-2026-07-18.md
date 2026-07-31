# OpenCode fork Gate 12: durable Turn lifecycle

Status: The primary-TUI busy-input correction was independently accepted and
integrated on 2026-07-30 at commit
`c5ea10b8ab0f573fef03b5066bbcb117a9e0a502`. Independent
review run `gate12-20260718-whole-01` still fixes the accepted strict Turn,
start, exact-target steer, draft, race, recovery, and child-lifecycle mechanics
at maintainer-authorized commit
`80f5fa30a22e3e0628cd4a05e2880063a1f8eb2d`. The later product-flow audit
falsified the completion claim for the TUI mapping: ordinary busy send meant
“later” without making the alternative visible before first use, timely
correction required an internal steer command, and no comparative evidence had
tested that error against irreversibly admitting an independent next question
into the running Turn. On 2026-07-29 the maintainer chose ordinary busy Enter as
the explicit, reversible “send after this response” action and a separately
visible configured action as “add to/correct this response.”
Fresh separate top-level reviewer task
`019fad21-8a6a-7450-af90-505c0bce53f8` returned `Revise` with
`G12-RC-001` through `G12-RC-003`. Its first exact-diff closure pass closed
`G12-RC-001`, found the new state/oracles sufficient for `G12-RC-003`, but kept
`G12-RC-002` open because one earlier completion-lost-steer clause still
authorized a new queued start identity. That residual clause and the matching
historical evidence were then fenced. The same reviewer returned `Accept` on
the second exact-diff closure with no blocker. The corrective contract at the
end of this record is now implementation authority only for the primary-TUI
busy-input default/discoverability/process-local delivery-state repair and its
focused replacement evidence. The original reviewer then returned `Revise` on
the first implementation/evidence pass with `G12-RC-IE-001` and
`G12-RC-IE-002`: busy Enter captured its target only after two IME timers, and
asynchronous editor/paste/dialog work begun before submission could still
mutate the draft or stash after the delivery claim. The repaired candidate now
captures the exact target and intent synchronously, claims the composer before
the IME flush, and rejects every stale asynchronous edit or stash mutation. On
the next exact-diff pass the same reviewer closed `G12-RC-IE-002` but kept
`G12-RC-IE-001` open: B could both start and finish during the IME delay, so no
active B remained when the later selection was materialized. The candidate now
captures a monotonic same-Session `turn.started` revision with A and carries it
through `later_selected`; any competing start makes the draft permanently
`undelivered` even when that Turn has already finished. The full B-cycle oracle
passes. The original reviewer returned second implementation/evidence
exact-diff `Accept` with no blocker: `G12-RC-IE-001` and
`G12-RC-IE-002` are closed, and the scoped Gate 12
implementation/evidence is integrated at
`c5ea10b8ab0f573fef03b5066bbcb117a9e0a502`.
Current disposition is owned by `docs/README.md`.

Date: 2026-07-18

Parent roadmap: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Architecture: [Learning-centered system architecture](../architecture/00-system-architecture.md)
and [native learning data model](../architecture/01-native-learning-data-model.md)

Primary predecessors:
[ADR-0005 durable Turn hierarchy](../decisions/0005-durable-turn-and-interaction-hierarchy.md),
[ADR-0007 process-local finite Turns](../decisions/0007-process-local-coordination-and-finite-turns.md),
and the
[passed Gate 8 learning-command settlement boundary](opencode-fork-gate-08-learning-command-settlement-2026-07-16.md)

Runtime and product constraints:
[ADR-0014 one-time OpenCode fork](../decisions/0014-one-time-opencode-fork.md),
[ADR-0012 learning-centered modular monolith](../decisions/0012-learning-centered-modular-monolith.md),
[ADR-0008 model-write initiative](../decisions/0008-model-write-initiative-and-durable-authority.md),
and
[ADR-0009 invocation/effect identity](../decisions/0009-separate-invocation-and-semantic-effect-identity.md)

Successor boundary: Gate 12 supplies whole-Turn truth to later retained
steering, natural-language bootstrap, learning context, future attention,
planning, terminal correction, and integrated-product Gates. It does not
implement those learning authorities.

This record owns the proposed Gate 12 engineering contract. Product behavior
and expensive boundaries under **Accepted maintainer decisions** come from the
maintainer and accepted project authority. Identity mapping, storage,
transactions, recovery, API shape, and evidence are derived engineering
proposals. Contradictory evidence may revise those derived sections but cannot
silently change the accepted product meaning. Contract acceptance requires a
fresh, separate top-level reviewer; same-context author preflight and a child
review do not satisfy that transition.

## Terminology

In this record, **the current Repa production Agent loop** means the execution
path inherited from OpenCode `v1.17.18` released-v1 and now owned by Repa. The
short form **released-v1 loop** refers to that lineage, not to a product named
“Repa v1,” an OpenCode runtime dependency, or an OpenCode compatibility target.

`Turn`, `Session`, `Assistant Message`, `Tool Part`, and `learner occurrence`
name distinct durable meanings. A provider request, an assistant sample, a
tool call, and a learner-visible Turn are not interchangeable uses of “turn.”

## Why this Gate exists

The current released-v1 loop already preserves typed Session messages and
Parts, can perform several provider samples and tools for one request, compacts
history, cancels live work, and delegates foreground tasks into child Sessions.
It does not durably name the whole unit of work caused by one admitted learner
request. Consequently, it cannot answer all of these questions from durable
state:

- which model operations and tool invocations belonged to one request;
- whether that request completed, failed, was interrupted, or exhausted a
  finite limit;
- which limits governed it and whether a retry should spend them again;
- whether an input joined the current work or began later work;
- which exact parent task caused a child run;
- what a restart must settle without redispatching provider or tool effects.

Gate 8 deliberately stopped below this aggregate. Its learner occurrence,
Assistant Message, Tool Part, physical invocation, and semantic-effect
identities remain honest local carriers, but none alone owns a complete Agent
interaction.

Gate 12 serves this part of the product loop:

```text
trusted learner request or delegated task request
-> atomic Session/Turn/input admission
-> finite released-v1 Agent work
-> durable model and tool membership
-> one truthful terminal outcome
-> later learning behavior may cite the exact interaction
```

Its owned invariant is:

> Every newly admitted root or synchronous delegated request belongs to one
> durable finite Turn in exactly one Session. Before external Agent work starts,
> the Turn, its initiating typed input, its resolved limits, and any newly
> created Session are committed atomically. Every counted released-v1 Agent
> model operation and admitted local tool invocation resolves to that Turn.
> The Turn has at most one immutable terminal outcome, exact replay never
> spends work twice, interruption never becomes completion, and restart never
> invents continuation. Accepted steering joins only the exact running Turn;
> local next-Turn queueing and unpromoted steering remain visibly unaccepted
> process state.

## Accepted maintainer decisions

The following decisions were accepted during the 2026-07-18 Gate 12 grill.
They are recorded by consequence rather than as an interview transcript.

### A Turn follows a real Agent request, not every model or utility call

A trusted root learner request starts a root Turn. A synchronous delegated
subagent request starts an ordinary child Turn. Further released-v1 Agent
model/tool continuation caused by that request remains in the same Turn.

The following do not create a Turn:

- direct shell or administrative operations;
- title, compaction, project-copy naming, representation, or other
  program-owned narrow model operations;
- rendering, projection, recovery bookkeeping, or synthetic context items;
- provider transport retry of an existing logical model operation.

These operations retain their own truthful identity and serialization rules.
They may not impersonate learner input or consume a Turn merely because they
occur while a Turn exists.

A command is classified by the work it actually admits, not by slash-command
syntax. A command that resolves into an interactive Agent request starts a
Turn; a shell, navigation, configuration, or other administrative command does
not.

### Durable Session creation begins with the first Turn

A durable empty Session is illegal. The TUI may hold an unsaved draft, but the
first root request atomically creates the Session, admitted learner occurrence,
running Turn, and initial typed User Message and Parts. A new child Session,
its delegated-request item, and its first child Turn are likewise atomic.

Direct shell, `/new`, title generation, or another utility operation cannot
materialize a durable Session before this admission. Session-scoped utilities
may still operate on an already admitted Session under their existing typed
semantics.

Standalone durable Session fork creation has the same restriction. Forking
history is a utility preparation, not a third Turn admission kind. Its
production disposition is defined under **Fork preparation and atomic
materialization** below.

### Model and tool budgets are independent and frozen

Each Turn stores separate finite model-operation and local-tool-invocation
limits resolved from trusted policy/configuration at admission. Steering cannot
increase, replace, or reset either limit. Continuing after exhaustion requires
a new Turn.

The model counter includes only logical released-v1 Agent-loop assistant
samples. Title, compaction, project-copy naming, representation, rendering,
and other program-owned narrow samples do not count. Provider transport retries
inside one logical sample do not count again.

Exclusion from the Agent model counter is not permission for an unbounded
internal loop. Each narrow operation retains its own bounded retry/failure
contract, and the released-v1 owner must fail rather than repeat an internal
operation indefinitely without causal progress toward another counted Agent
operation or terminal outcome.

The tool counter includes an actual runtime-owned local tool invocation
admission, including an admitted built-in, plugin, MCP, or synchronous task
tool call. It does not count transport retry, exact settlement replay, a
provider-executed operation outside the local tool registry, or an over-limit
candidate that was rejected before invocation admission. A provider-executed
operation cannot be used to bypass local admission for a Repa-owned filesystem,
process, Session, or learning-domain effect.

Budget values are inspectable engineering state, not routine learner-facing
noise. Exhaustion is always visible as a terminal outcome with an exact receipt.

### Partial work remains truthful but is not promoted into completion

A failed, interrupted, or exhausted Turn retains already durable assistant
text, tool presentations, exact tool settlements, and committed domain writes.
The projection marks the Turn and any unfinished response as incomplete. It
does not describe the interaction as completed teaching and does not promote
partial assistant prose, summaries, or tool presentation text into durable
learning truth.

Already committed domain transitions remain governed by their owning
authority and receipts; Gate 12 does not roll them back or make them false
because later work in the same Turn failed.

### Historical busy-input default (suspended on 2026-07-29)

While a Turn is active, ordinary terminal submission defaults to a
process-local editable next-Turn queue. It is not durably admitted until its
Turn starts. Explicit steer targets one exact active Turn, creates no new Turn,
and resets no budget.

The TUI must expose steering through its configurable, discoverable keymap and
help surface. HTTP and SDK callers receive strict primitives and decide their
own queueing policy. There is no Gate 12 server-side durable inbox or generic
“start-or-steer” operation.

This choice deliberately differs from the pinned Codex TUI default, where
Enter steers and Tab queues. The exact-turn steer guard is adapted; the default
interaction choice was Repa-owned. The dated correction at the end of this
record suspends this mapping as implementation authority and reopens its
presentation/evidence question; the strict primitives and exact-target guard
remain accepted.

### A child Turn is an ordinary Turn in an independent child Session

There is no special subturn runtime or reduced child lifecycle. A child Turn
has its own Session, Turn ID, limits, counters, outcome, and model/tool
membership. It also records the exact parent Turn, exact parent task invocation,
and trusted depth. The depth is derived from durable lineage and checked against
a hard admission ceiling; prompt text cannot choose it.

The independent child Session is required because the synchronous parent and
child are simultaneously running while one Session may own at most one running
Turn. Child Sessions and Turns are collapsed beneath the parent task by
default, but remain inspectable and cannot hide failure or exhaustion.

The baseline supports synchronous foreground subagents. Existing background
subagent source may remain default-off and hibernated, but Gate 12 does not
ship detached/background delivery. That capability requires a future durable
async continuation/inbox and recovery contract.

### Child results are task-shaped, not transcript-shaped

The parent receives only a bounded structured result containing the exact
child Session ID, child Turn ID, terminal outcome, and the output requested by
the parent, or an explicit incomplete/partial marker. The child transcript,
tool calls, receipts, and intermediate reasoning remain in the child Session
and are not copied into the parent transcript or model context.

If the parent needs detail, it must explicitly inspect or query the child, or
invoke a follow-up against that exact child Session. Such a follow-up creates a
new ordinary child Turn after the child Session is idle. Agent name,
description, or textual similarity never selects a previous child implicitly.

### Child failure and cancellation preserve the parent boundary

A child `failed` or `exhausted` outcome becomes a structured task result. It
does not automatically terminate the parent; the parent Agent may adapt within
its remaining budget.

`steer(turnID)` targets exactly one Turn and does not propagate. Steering a
parent that is synchronously waiting for a child waits for the parent's next
safe boundary. Steering the child targets that child directly.

`interrupt(childTurnID)` cancels that child and its descendants. The parent
receives an interrupted child result and may continue. `interrupt(parentTurnID)`
cancels the whole descendant subtree. A terminal descendant remains terminal;
cancellation never rewrites a completed result.

### Child capability is explicit and non-escalating

A child is not blanket read-only, but durable learning commands require
explicit capability delegation. Effective child authority is an intersection,
never an elevation: program and LearnerHome policy, parent/session denials,
external-directory restrictions, child profile restrictions, and the explicit
delegation all continue to apply. Prompt or task prose cannot grant a
capability. A stronger specialist role likewise requires explicit authority
for that role and capability.

A child learning-command receipt cites the actual child Turn, child model
operation, and child invocation; the exact parent task chain; and the exact
learner occurrence at the root of that delegated causal chain only when the
lineage is valid. That occurrence may be the Turn's initiating request or a
later accepted learner steer. A child cannot invent learner provenance from
copied text.

### Small means causally complete, not crude

Gate 12 must establish a production-grade lifecycle and one shared typed
contract across the TUI, HTTP API, generated SDK, database, and released-v1
runner. It may be the smallest boundary that owns these invariants, but it may
not use a compatibility shim, placeholder state, TODO handoff, hidden second
runtime, or UI-only convention in place of them.

## Current evidence and falsification pressure

### Accepted Repa authority

- ADR-0005 already owns the `Session -> Turn -> logical model operation ->
transport attempt` and `Turn -> tool invocation` hierarchy, the four terminal
  states, exact replay, nondecreasing causal time, and one running Turn per
  Session.
- ADR-0007 already owns process-local unpromoted steering, permissions,
  cancellation tokens, stream deltas, and provider retry state; restart orphan
  interruption; separate finite counters; the exhaustion receipt; FIFO local
  tools; and one learning mutation per immutable model context.
- Gate 8 already maps one released-v1 interactive Assistant Message ID to one
  logical provider sample and one admitted Tool Part ID to a physical learning
  invocation. It also supplies learner-occurrence lineage, exact invocation
  settlement, and transaction-first learning-command results.
- ADR-0014 requires the released-v1 production path, one native database, typed
  Session items, one state owner, no dual runtime, and no OpenCode compatibility
  target.

Gate 12 makes these accepted meanings real in the fork; it does not reopen
them as local preferences.

### Actual current fork

The current fork supplies useful mechanisms but not the owned invariant:

- `packages/opencode/src/session/prompt.ts` creates the interactive User Message
  and then enters the released-v1 loop. It creates a new Assistant Message
  immediately before each interactive provider sample, but has no durable Turn
  aggregate, Turn counter, or Turn terminal commit.
- The inherited Agent `steps`/`MAX_STEPS_PROMPT` path shapes a later sample but
  is neither an independent model/tool budget nor an atomic durable
  `exhausted` transition. It is evidence for the sample boundary, not a Gate 12
  limit implementation.
- `packages/opencode/src/session/run-state.ts` and
  `packages/opencode/src/effect/runner.ts` already serialize live work per
  Session and allow different Sessions to run concurrently. Their current
  `ensureRunning` behavior joins same-Session prompt work without an exact Turn
  admission distinction, so it cannot remain the public start/steer semantic.
- `packages/opencode/src/session/lifecycle.ts` already supplies a useful
  Session mutation/admission handoff, but it does not reserve and terminally
  account for a durable Turn across the commit-to-live-owner gap. Gate 12 must
  extend this owner rather than wrap it with an unrelated runner.
- `packages/core/src/session/sql.ts` stores Sessions, v1 Messages, and Parts.
  Its preview-v2 `session_input` rows are not authority for the released-v1
  path and cannot be adopted as a hidden durable queue.
- Gate 8's occurrence and learning-command tables already preserve causal
  learner identity and exact learning-tool settlement. They do not group all
  model and tool work into one Turn.
- `packages/opencode/src/cli/cmd/run/runtime.queue.ts` already demonstrates the
  desired process-local editable next-prompt queue for direct interactive mode.
  Gate 12 must make the product surfaces consistent with that behavior.
- `packages/opencode/src/tool/task.ts` already uses child Sessions, supports an
  exact `task_id`, and propagates foreground parent abort. It currently returns
  final text, derives permissions without the accepted explicit capability
  envelope, creates child Session and first prompt in separate operations, and
  contains experimental background machinery. These are adaptation points,
  not a second runtime to preserve.
- `packages/opencode/src/session/session.ts` currently materializes
  `session.fork` before any genuine request and recursively deletes child
  Sessions through separate lifecycle mutations. Both paths are supported
  released-v1 behavior, but neither can survive unchanged under the accepted
  first-Turn and atomic-subtree contracts.
- `packages/opencode/src/session/processor.ts` owns Tool Part creation and
  unsettled-item cleanup, while `packages/opencode/src/session/revert.ts` owns
  physical suffix cleanup. They are the present seams that must preserve a
  sealed candidate set and complete Turn/item aggregates rather than creating
  parallel projection or deletion paths.
- The current HTTP API exposes Session-scoped prompt and abort operations. It
  does not require an expected active Turn ID and cannot express the accepted
  race contract.

### Mature mechanisms adapted and deliberately not copied

The fork's per-Session runner is a mature per-key serialized-owner mechanism.
Foreground child Sessions already form the useful basis of structured
parent/child work. Gate 12 extends those owners with durable Turn identity and
hierarchical cancellation instead of introducing a scheduler or workflow
engine.

The pinned Codex reference at `rust-v0.144.1` /
`44918ea10c0f99151c6710411b4322c2f5c96bea` supplies secondary evidence:

- `turn/steer` requires the caller's expected Turn ID;
- its TUI tracks the active Turn and handles completion races;
- child wait returns bounded status/final output rather than copying history;
- child agents are represented through ordinary conversations plus parent
  coordination.

Repa does not copy Codex's default Enter behavior, background/concurrent-agent
product scope, or its residual generic start-or-steer path. These differ from
the accepted Gate 12 boundary.

## Proposed Gate result

After Gate 12 closes:

1. Every newly admitted learner or synchronous delegated request has one
   durable Turn identity before provider work starts.
2. A first request cannot leave an empty or orphan Session.
3. Every interactive released-v1 Assistant Message and every admitted local
   tool invocation was admitted under exactly one Turn while it was running.
4. Separate frozen model/tool counters prevent additional work before its
   effect begins and settle exhaustion exactly once.
5. Start, steer, interrupt, completion, and restart races have typed,
   inspectable outcomes.
6. Synchronous child work uses ordinary child Turns with exact lineage,
   non-escalating capability, hierarchical cancellation, and bounded results.
7. The TUI, HTTP API, SDK, events, and durable reads expose the same meanings.
8. The existing released-v1 loop remains the sole production executor.

This is a structural Interaction boundary. It need not complete a learning
authority or a learner-visible product loop to be legitimate.

## Identity and state vocabulary

| Meaning                       | Durable identity and carrier                                                                             | Gate 12 rule                                                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Session                       | existing Repa Session ID                                                                                 | Long-lived transcript container; no new durable Session without its first admitted Turn.                                                        |
| Turn admission                | Turn ID generated before first dispatch                                                                  | Idempotency identity for one normalized root or delegated request, never a text hash.                                                           |
| root causal input             | stable User Message ID plus Gate 8 learner-occurrence ID                                                 | Created with the root Turn; repeated context retains this identity.                                                                             |
| accepted steer                | stable steer/input ID plus a typed User presentation and, for learner-authored input, its own occurrence | Joins one exact running Turn after durable promotion; does not create or reset a Turn.                                                          |
| delegated input               | stable child request item linked to the exact parent task Part                                           | Program-authored task cause; cannot impersonate a learner occurrence.                                                                           |
| logical Agent model operation | existing released-v1 Assistant Message ID plus exact current Turn-input membership                       | Counted once when admitted to a Turn before its provider stream starts; its causal learner occurrence is runtime-derived, never model-selected. |
| provider transport attempt    | operation-local diagnostic identity                                                                      | Retry detail only; never another Turn or model-budget unit.                                                                                     |
| local tool candidate          | host Tool Part/call presentation identity and provider emission ordinal                                  | Receives one terminal candidate disposition even when budget or a prior terminal transition prevents invocation.                                |
| local tool invocation         | admitted tool-candidate identity plus Turn invocation admission                                          | Counted once before runtime-owned execution; exact replay never increments again.                                                               |
| semantic learning effect      | command-owned Gate 8/later domain identity                                                               | Remains separate from Turn, model, and physical invocation identity.                                                                            |
| child lineage                 | child Turn ID plus exact parent Turn ID and parent task Part ID                                          | Depth derives from this trusted chain; child Session parentage alone is insufficient.                                                           |
| terminal outcome              | immutable terminal transition owned by the Turn                                                          | Exactly one of `completed`, `failed`, `interrupted`, or `exhausted`.                                                                            |
| exhaustion receipt            | exact rejected attempt identity and normalized request envelope                                          | Proves why no further model operation or tool invocation started.                                                                               |

A digest may support equality and conflict detection, but no digest of text,
prompt Parts, task description, or tool input becomes one of these identities.

### Turn admission kinds

The first schema needs a closed admission distinction:

- `learner`: a root learner request with a Gate 8 admitted occurrence;
- `delegated_task`: a synchronous child request caused by one exact admitted
  parent task invocation.

A learner-authored steer remains a learner occurrence but not a new Turn
admission kind. Internal continuation and synthetic context are neither kind.
Adding another kind requires a real producer and recovery contract rather than
an open string.

## Owned durable records

The exact Drizzle layout remains an implementation decision, but the first
implementation requires these durable meanings inside the native database:

1. **Turn aggregate** — Turn and Session IDs, admission kind, initial input
   identity, normalized model/tool limits, current counters, state, admission
   time, optional terminal time/reason, and secret-free policy-resolution
   basis.
2. **Turn input membership** — exact initiating and promoted-steer typed item
   identities, their ordering, source kind, and occurrence link where valid.
3. **Turn model-operation membership** — exact Assistant Message ID, exact
   current Turn-input membership, runtime-derived causal occurrence where
   valid, stable ordinal, and admission time for each counted released-v1 Agent
   sample.
4. **Turn tool-candidate disposition** — exact Tool Part/call presentation,
   emission ordinal, normalized envelope/fingerprint, and one state:
   `pending_admission`, `admitted`, or a typed terminal `not_started` result.
5. **Turn tool-invocation membership** — exact admitted candidate identity,
   stable ordinal, and admission time for each counted runtime-owned invocation.
6. **Child lineage** — exact parent Turn and parent task Part, trusted depth,
   and the child Session relationship.
7. **Terminal detail** — one outcome with a bounded reason projection and final
   observed counters.
8. **Exhaustion receipt** — counter kind, observed count, configured limit,
   rejected attempt identity, canonical request envelope/fingerprint, and
   transition time.
9. **Minimal unavailable-source receipt** — only when a surviving parent task
   result, fork/historical presentation, child-lineage reference, or
   independently owned learning receipt still cites deleted Interaction
   identity, an opaque no-content Turn/operation lineage tombstone preserves
   resolvability without preserving the transcript.

These may be separate constrained tables or an equally strong normalized
shape. They may not be hidden in generic Session metadata or one untyped JSON
event stream.

The database must enforce, rather than merely assume:

- at most one `running` Turn per Session;
- one Session and one initiating item per Turn;
- terminal-state finality and terminal-field shape;
- counter/ordinal uniqueness and nonnegative bounded values;
- one Turn and one exact current input for each counted Assistant Message;
- one candidate record and state transition chain, exactly one terminal
  candidate/invocation disposition, and at most one invocation admission for
  each local Tool Part/call;
- valid child parent/task/depth shape;
- `exhausted` only with its exact receipt, and no receipt for another outcome;
- nondecreasing Turn causal time and later-Turn Session admission time.

Stored counters are admission authorities, not cached analytics. Their
transactional increment and the corresponding membership insert succeed or
fail together.

Gate 12 adds no universal event store. Existing typed event publication may
project committed Turn changes, but replayable state remains in the owning
records.

### Causal time floors

Gate 12 carries all three accepted ADR-0005 ordering scopes:

1. a Turn-local frontier for every model admission, tool admission/settlement,
   terminal transition, and recovery event;
2. a same-Session frontier for later Turn/input admission;
3. the native database-wide shared-learning-state frontier, advanced by every
   committed shared domain transition regardless of originating Session.

Before a model operation is dispatched, context construction produces one
immutable provider-request snapshot together with the highest shared-state
frontier that snapshot consumed. When that snapshot is sealed, operation
admission also observes the latest committed database-wide shared-state
frontier. Its time is floored to the maximum of trusted wall time, the Turn
frontier, the Session frontier, that latest committed frontier, and the
snapshot's consumed frontier, and the admitted operation is bound to that exact
snapshot. A transition committed after the seal is not present in that
snapshot. If context is rebuilt or consumes a later transition, the owner must
revalidate and raise the operation floor before provider dispatch; it cannot
send a newer snapshot under the older admission time.

Immediately before a local tool executes, its invocation admission time is
floored through the same rule against the latest committed shared-state
frontier. Shared learning-state APIs return the exact frontier consumed by a
later domain read; the invocation/settlement path must advance to that frontier
before the read can authorize an effect or become a subsequent model result. A
resulting domain transition cannot precede that consumed frontier and advances
the database-wide frontier in its owning transaction.

This is causal ordering, not a total order for unrelated Session transcripts
and not a global stale-write revision. A caller-supplied backdated new learner
occurrence rejects; exact replay is checked first and retains its original
time. Provider retry and internal rendering do not mint another frontier event.

## Admission, exact replay, and conflict

### Stable identity exists before dispatch

Every start caller obtains a Turn ID before its first network or in-process
dispatch. A new-Session start also has stable Session and initial User Message
identities before dispatch. The TUI and generated SDK generate and retain these
values for retry; a server-side caller follows the same typed contract.

The normalized admission envelope includes the admission kind, Session/input
identities, typed content/attachments, selected Agent/model/profile inputs,
resolved finite limits, and child lineage/capability envelope where relevant.
It stores no credential, raw provider transport state, or mutable prompt
rendering.

For a new Turn ID, omitted limits resolve from current trusted policy and are
stored before execution. For an existing Turn ID, exact replay is checked
first: an omitted limit compares as the already stored admitted default, not as
a wildcard and not as a newly changed default. Explicitly different limits or
another changed normalized field conflict.

### Exact replay precedes live-state rejection

Admission follows this order:

1. If the Turn ID already exists, compare the complete normalized envelope.
2. An exact terminal match returns the stored Turn. An exact running match
   joins or observes the matching valid live owner; if no such owner exists in
   the current process, the same-Session coordinator first settles the orphan
   `interrupted` and returns that stored terminal result.
3. Reuse with a changed envelope returns a typed identity conflict.
4. Only a physically new Turn checks whether its Session already has a running
   Turn and attempts new admission.

The same rule applies to a promoted steer identity and to operation/tool
membership. Same text with a new identity is new input. Repeated text with an
existing identity after compaction, response loss, or restart is replay.

### Admission-to-owner handoff

SQLite cannot atomically install an in-memory runner, so the live Session
coordinator owns an interruption-safe handoff around the admission transaction:

1. Under the exact Session admission guard, reserve the stable Session/Turn ID
   in a process-local `admitting` owner slot before database commit. Reserving a
   new stable Session ID is legal even though its row does not yet exist.
2. Execute the complete root or child admission transaction while that owner
   reservation and its cancellation/finalizer remain installed.
3. After commit, use an interruption-masked handoff to promote the same
   reservation to the released-v1 running owner. Provider work is still
   forbidden at this point.
4. If cancellation, runner construction, fiber registration, or any other
   post-commit step fails before promotion, the reservation's finalizer settles
   the durable Turn `interrupted` with reason `owner_handoff_failed`, closes any
   admitted item-local state, and only then releases Session admission.
5. Only a successfully promoted owner may begin model-operation admission and
   provider work.

If the compensating terminal write is temporarily unavailable, the reservation
remains installed in a non-executing `terminalizing` state and blocks new
admission; bounded recovery retries the settlement. It may not disappear and
leave a same-process durable `running` row. Whole-process loss is handled by
startup orphan recovery.

Every public exact replay, active-Turn query, start, steer, and interrupt checks
the durable row and live owner together under this coordinator. A running row
with no matching `admitting`, `running`, or `terminalizing` owner is an observed
same-process orphan and is settled interrupted without dispatch. A live owner
whose Turn envelope does not exact-match the row is an integrity failure that
blocks execution rather than adopting either side.

### Root first admission is one transaction

For a new root Session, one native database transaction creates:

- the Session;
- the Turn in `running` state with frozen limits and zero counters;
- the initial typed User Message and Parts;
- the Gate 8 admitted learner occurrence and origin presentation;
- Turn/input membership and committed typed events.

Provider work starts only after commit. Any validation, uniqueness, storage,
event-projection, or injected fault rolls back the whole set. The handoff above
owns cancellation and failure after commit.

Starting in an existing idle Session uses the same transaction without a new
Session row. The Session causal frontier floors the new admission time as
specified by ADR-0005.

### Child first admission is one transaction

After the parent task invocation is durably admitted, a new child admission
atomically creates:

- the child Session with its ordinary parent-Session relationship;
- the child Turn with exact parent Turn/task Part and derived depth;
- the delegated task item and Turn/input membership;
- the frozen child limits and effective delegated-capability projection;
- committed typed events.

No child provider work starts before commit. A depth, parent-state, lineage,
capability, or uniqueness failure creates no child Session or Turn. Reuse of an
existing child Session requires exact authenticated lineage, an idle Session,
and a new child Turn identity; arbitrary Session adoption by `task_id` is not
legal. The child uses the same reserved-owner handoff; the parent task does not
begin waiting on an ownerless durable child Turn.

### Fork preparation and atomic materialization

The supported released-v1 standalone durable `session.fork` transition is
retired because copied history is not a learner or delegated-task admission.
The capability is preserved as preparation plus root start:

- the TUI or caller may hold a process-local fork draft naming the exact source
  Session, cutoff/frontier, and desired presentation metadata;
- abandoning the draft or losing the process creates no target Session;
- materialization is a root `start` with ordinary `learner` admission and stable
  target Session, Turn, and User Message IDs; the normalized start envelope
  also carries the exact fork basis;
- one transaction reads the exact source snapshot, creates the target Session,
  clones the selected historical presentations under Gate 8 provenance rules,
  and creates the genuine initiating learner Turn/input/occurrence;
- cloned historical Messages/Parts remain read-only presentations of source
  occurrence, model-operation, tool, and Turn identity. They consume no target
  budget, belong to no target Turn, and never become new replay keys;
- source drift, deletion, busy state, clone conflict, or any injected failure
  rolls back the complete target Session and root admission;
- exact retry returns the same materialized Session/Turn, while a changed
  source/cutoff/content envelope conflicts.

HTTP and SDK may expose this as a start variant or an explicit `fork_start`, but
no supported route may persist a fork target without its first genuine root
Turn. A follow-up to an existing child continues to use exact child Session
reuse, not fork materialization.

### Historical data is not reverse-engineered into Turns

Migration must not infer Turn boundaries from old Message order, finish
reasons, matching text, or Session timestamps. Existing nonempty pre-Gate-12
transcripts may remain explicitly legacy history and can receive a newly
admitted Gate 12 Turn. They do not gain fabricated occurrence, model-operation,
tool, or terminal truth.

Truly empty inherited Sessions cannot remain legal production records. The
migration may delete one only after proving it has no Message, Part, child,
domain, or other durable reference. A referenced anomaly fails with a bounded
diagnostic rather than cascading or synthesizing a request. Repa has no
OpenCode user-data compatibility promise, but migration still preserves
truthful state.

## Strict start, steer, and interrupt commands

### Start is never state-dependent steer

`start` admits a physically new Turn only when its target Session has no running
Turn. Exact replay is the sole exception because it is not a new admission. A
new Turn while another is running returns a typed `turn_already_running`
result containing the actual active Turn identity needed for inspection, not
permission to retarget it.

The server never interprets `start` as `steer` based on live state. The TUI may
choose another user-facing action, but it must invoke the corresponding strict
primitive.

### Steer names the expected Turn

A steer request carries:

- Session ID;
- expected active Turn ID;
- stable steer/input ID;
- typed learner content and source classification.

Before durable promotion it may wait process-locally for the next safe
provider-turn boundary. Public success means that the input and its valid
occurrence/presentation were committed into the exact expected Turn. Merely
placing it in memory is not acceptance.

The required typed failures include:

- `no_active_turn` when the Session has no running Turn;
- `active_turn_mismatch` when another Turn is active;
- `turn_not_steerable` when the expected Turn is terminal or already crossing
  a non-reopenable terminal boundary;
- `admission_conflict` when a stable steer identity is reused with changed
  content or lineage.

Exact replay of an already promoted steer returns its stored membership before
these live-state checks. A steer never silently moves to a replacement Turn.

### Completion and steer have one atomic winner

At a safe boundary, the Session owner serializes durable steer promotion and
Turn completion against the exact running Turn:

- if steer promotion commits first, the Turn remains running and the loop must
  reevaluate continuation before admitting another model operation;
- if terminal completion commits first, the steer receives
  `turn_not_steerable` and remains undelivered.

The TUI may preserve the complete text visibly after the second result, but it
is `undelivered`, not `later_selected`: steering did not occur, no new start
identity is minted, and no automatic start, steer, retry, or retarget follows.
Only a later explicit learner action may choose a new delivery path. HTTP and
SDK callers receive the strict failure and make their own choice.

### Interrupt also names one Turn

Public interrupt targets an exact Turn ID. Session-scoped legacy abort cannot
remain as an ambiguous “cancel whatever is current” contract; it must either
carry the expected Turn identity through the typed API or be retired from the
supported surface.

Interrupting an already terminal exact Turn is idempotent and returns its
stored outcome. A missing Turn or Session/Turn mismatch is typed. A successful
interrupt begins hierarchical cancellation and settles every still-running
target in scope as described below.

## Process-local queue and safe-boundary steering

The server owns no durable Gate 12 queue. The terminal stores only
learner-selected later drafts in that path, and only in the current process.
Each remains editable and removable. Its one promotion attempt binds one stable
start identity to the complete snapshot; a failed delivery does not mint a new
automatic identity or re-enter the later path. Closing or crashing the process
may lose these drafts, and the UI must not label them accepted, synced, or
recoverable.

Unpromoted steering is also process-local. A safe promotion boundary is a point
after the current provider operation and its complete sealed tool-candidate set
have reached their terminal candidate/invocation dispositions, and before the
next interactive model operation is admitted. When the parent waits
synchronously for a child, its next safe boundary is after the child task result
returns to and settles the parent tool invocation.

Several pending steers preserve FIFO order and distinct input identities. The
baseline promotes at most one new learner-authored steer before admitting the
next interactive model operation. That item becomes the Turn's exact current
causal input; later steers remain process-local until later safe boundaries.
This deliberately rejects ambiguous batched-occurrence attribution. It does
not reset limits or create a Turn.

If the Turn becomes terminal before a later pending steer is promoted, that
steer returns the ordinary exact-Turn non-steerable result and remains
unaccepted. Program-owned synthetic continuation may be assembled around the
current input, but it neither replaces the current causal input nor supplies a
learner occurrence.

Admission freezes one causal-input window for the model operation and every
Tool Part, local invocation, and synchronous child request emitted by that
operation. Those descendants resolve occurrence provenance through the frozen
model membership, never through whatever input is current later. The window
closes only after the sealed candidate set and any synchronous child work have
settled. A later steer cannot be promoted into the middle of it. Consequently,
a mutation emitted from A's model operation remains caused by A even when steer
B is already waiting; B can become causal only for a later model operation.

Completion checks pending process-local steering under the same Session owner.
A steer that loses the final atomic race remains unaccepted even if it arrived
while the terminal was visually “busy.”

## Released-v1 execution ownership

Gate 12 extends the existing `SessionRunState`/released-v1 prompt ownership
chain. It does not route through preview-v2 `SessionExecution`, duplicate the
tool loop, or persist provider work for later replay.

The live owner is keyed by Session and carries the exact running Turn ID. A new
start promotes the pre-commit reservation into that owner after durable
admission. Existing same-Session
`ensureRunning` join semantics are internal mechanics only; they cannot admit
an unclassified prompt. Every entry is explicitly start, promoted steer,
internal continuation, or a Session utility operation.

Different Sessions may execute concurrently. One Session still has one live
execution lane. The parent and child can therefore run simultaneously only
because the child owns a separate Session.

### Model-operation admission

After constructing the immutable context/request snapshot but immediately
before creating/starting an interactive released-v1 Assistant sample, the Turn
owner atomically:

1. verifies the exact Turn is still `running`;
2. verifies the model counter is below its stored limit;
3. records the exact request-snapshot identity, its consumed shared-state
   frontier, and the latest database-wide shared-state frontier observed when
   the snapshot is sealed, then floors the operation time before provider
   sampling;
4. resolves the one exact current Turn-input membership and its trusted causal
   learner occurrence, if that input has one;
5. inserts unique Turn membership for the Assistant Message ID, current input,
   causal occurrence, and next ordinal;
6. increments the model counter;
7. commits before the provider sees the snapshot or its stream starts.

The existing Assistant Message remains the logical operation identity and
retains its own completion/error/partial state. Provider middleware retries
remain attempts beneath that identity. An exact operation replay returns the
stored operation and does not increment.

The root input is initially current. Ordinary tool-result continuation inherits
the same input/occurrence. Promoting one learner steer changes the current input
only for later model operations. Although model context may contain older
learner items, neither the model nor a tool payload may select one as trusted
causal provenance. A durable learning command based on an older occurrence is
conservatively unavailable until a new trusted learner input makes that cause
current or a later accepted authority designs another exact source mechanism.

A delegated child input stores the exact parent model operation and inherits
that operation's runtime-bound causal learner occurrence. Child model
operations bind to the delegated input while carrying that occurrence through
the exact parent task chain. If the parent model operation has no valid causal
learner occurrence, a child command that requires learner causality is denied;
copied prompt text cannot repair the lineage.

Gate 4's trusted call-purpose classification decides whether a sample is an
interactive Agent operation. Title, compaction, project-copy naming, Gate 11
representation, and other closed internal purposes cannot be counted merely
because they share provider infrastructure.

### Tool-invocation admission

Every provider-emitted local Tool Part is first registered durably as a
candidate under its exact Assistant Message, Turn, normalized envelope, and
provider emission ordinal. Candidate registration and Part presentation use
one Session mutation; a Part cannot become visible without a matching candidate
disposition owner. Registration itself consumes no tool budget and performs no
tool effect. The Assistant operation serializes emitted-candidate registration
and seals that candidate set before the FIFO lane admits any of its calls. Thus
an already emitted sibling cannot be hidden behind the invocation that happens
to reach the budget boundary first.

At the common runtime-owned local tool execution seam, before any filesystem,
process, network, MCP, task, or learning-domain effect begins, the Turn owner
atomically:

1. verifies the exact Turn is still `running`;
2. verifies the tool counter is below its stored limit;
3. observes the latest database-wide shared-state frontier and floors the
   invocation time before execution;
4. verifies the exact candidate remains `pending_admission`;
5. transitions it to `admitted`, inserts unique Turn invocation membership and
   the next ordinal, and increments the tool counter;
6. commits before execution.

The existing process-local FIFO lane remains. A provider-emitted call
presentation rejected before this admission has no physical local invocation
and performs no effect. Its transcript projection and the exhaustion receipt
must say `not_started` rather than fabricate a tool error or completed receipt.
Every candidate reaches exactly one terminal presentation or an admitted
invocation that reaches its own exact settlement.

Gate 8 learning commands retain their stricter physical-invocation and
transaction-first settlement. Their invocation membership and the Turn counter
must commit through one causally ordered admission path; Gate 12 cannot wrap
them with a counter that races their existing effect.

A synchronous task tool invocation consumes one unit of the parent tool
budget. The child Turn's model and tool work consumes only the child's frozen
budgets. Finite per-Turn limits, the parent's finite task invocations, and the
trusted depth ceiling bound the foreground tree without charging child samples
as fake parent samples.

## Budget exhaustion

Before an additional model operation or tool invocation, the runtime compares
the current admitted count with the frozen limit. The next attempted operation
or candidate already has its stable identity and normalized envelope, so the
receipt is replayable even though no forbidden effect starts.

### Model exhaustion

Model exhaustion is attempted only at the safe boundary after every previously
admitted model operation, tool candidate, and invocation has reached its
item-local terminal disposition. In one transaction the Session owner verifies
the Turn still runs and the attempted Assistant operation is neither admitted
nor a replay, writes the immutable model-exhaustion receipt, settles the Turn
`exhausted`, and emits the committed terminal projection. It creates no new
Assistant Message and starts no provider operation. Exact replay returns that
receipt; changed reuse conflicts.

### Tool exhaustion and sibling closure

After one Assistant operation has sealed its emitted candidate set, the FIFO
lane may discover that the next candidate has no remaining tool unit. The
Session owner closes invocation admission for that set and brings every earlier
admitted FIFO item to its truthful item-local terminal state. It then uses one
transaction to:

- verify the Turn is still running and the candidate is not an exact replay;
- write the immutable tool-exhaustion receipt;
- settle the Turn as `exhausted` with final counters;
- mark the triggering candidate `not_started_limit` and link it to the exact
  receipt;
- mark every already persisted later unadmitted sibling candidate
  `not_started_turn_exhausted` and link it to the same winning terminal
  transition;
- emit the committed terminal change.

The trigger and later siblings do not become local invocations and cannot
produce external effects. Exact retry of the triggering envelope returns the
same receipt. Reusing its attempt identity with a changed envelope conflicts.

An exact replay of a sibling marked `not_started_turn_exhausted` returns that
stored disposition and the winning receipt link; it neither becomes the
trigger nor creates another receipt. A changed sibling envelope conflicts. A
provider callback after the Assistant operation sealed its candidate set is an
integrity failure and is rejected before Part/candidate persistence; it can
never enter the FIFO lane.

The tool-exhaustion transaction is illegal while an earlier admitted tool
invocation or the owning Assistant operation lacks its item-local settlement.
The owner first finishes or interrupts that item through its own lifecycle,
then retries the same exhaustion transition. Turn inspection is reconstructably
terminal only when every persisted candidate is terminal and every admitted
invocation is settled. This preserves ADR-0007's causal FIFO without inventing
a partial-order tool scheduler.

Model exhaustion does not imply tool exhaustion, and vice versa; the receipt
names the exact counter. Both limits remain visible in Turn inspection. No
prompt, Agent profile response, steer, parent task prose, or child can raise a
frozen limit.

## Terminal lifecycle and partial output

The only legal lifecycle is:

```text
running -> completed | failed | interrupted | exhausted
terminal -> no transition
```

The first valid terminal compare-and-set wins. Every terminal outcome stores
its time, final counters, and a bounded typed reason; exact terminal replay
returns it unchanged.

### Completed

`completed` is legal only when:

- the released-v1 loop reached its normal no-more-current-work condition;
- no admitted model operation or tool invocation remains nonterminal;
- every durably promoted steer has been considered by the loop;
- the completion transaction wins against exact-Turn steer and interrupt;
- no runtime failure is being hidden as an ordinary finish.

A local draft queued for the next Turn does not block completion because it has
not been admitted.

### Failed

An unrecoverable provider, tool-runtime, permission-channel, projection, or
owner error that prevents legal continuation settles `failed`. A single tool
error does not automatically fail the Turn when its exact result is available
to the Agent and the loop can continue. Failure reasons are bounded and
secret-free; raw provider diagnostics remain in their existing diagnostic
owner.

### Interrupted

Explicit interrupt, ancestor cancellation, live-owner loss, or startup
recovery of an orphaned running Turn settles `interrupted` with a typed reason.
It never becomes `completed` because an assistant message happened to contain
text or a provider returned a finish reason before cancellation won.

### Exhausted

`exhausted` is legal only through the matching model/tool limit transition and
receipt. Generic error handling cannot mint it.

### Incomplete projection

Turn inspection and terminal rendering distinguish:

- item-local truth: a particular Assistant Message or Tool Part may itself be
  complete, failed, or partial;
- interaction truth: a non-completed Turn did not finish the requested Agent
  interaction.

Interrupted streaming text and unsettled tools receive their existing
item-local incomplete/error markers. Completed earlier tool receipts remain
exact. The final learner-facing projection visibly marks the Turn incomplete
and does not silently reuse partial prose as a completed Tutor response.

## Child Turn lifecycle

### Lineage and admission ceiling

A root Turn has depth `0`. A child depth is exactly `parent.depth + 1`, derived
inside the child-admission transaction. The parent task Part must belong to the
named running parent Turn and represent an admitted synchronous task
invocation. The child Session must be the exact new or authorized reused child
Session.

At or beyond the configured hard ceiling, the task tool returns a structured
depth-limit failure and creates no child Session or Turn. The parent task tool
itself remains an admitted parent invocation and may be reported to the Agent.

Lineage is a tree of exact invocation causes, not a lookup by Agent name,
description, prompt text, or Session title.

### Foreground ownership and follow-up

The parent remains `running` while its task invocation awaits the child. The
child uses the ordinary released-v1 loop in its own Session. Its terminal
outcome settles the parent task invocation with the bounded child result.

An explicit follow-up may reuse the exact child Session only when:

- the requesting parent has authority over that durable lineage;
- the child Session is idle;
- the new task invocation is durably admitted in the current parent Turn;
- a new child Turn and delegated input identity are supplied;
- effective profile, capability, directory, and policy checks pass again.

It does not reopen a terminal child Turn or append work without a new Turn.

### Bounded task result

The parent-visible result has this semantic shape:

```text
child_session_id
child_turn_id
terminal_outcome
requested_output:
  complete(value) | incomplete(partial_or_absent, reason)
```

The exact encoding and output schema may be tool-specific, but the envelope is
shared. It contains no automatic transcript dump, tool receipt bundle, hidden
reasoning, or “most relevant” history invented by the runtime. Inspection and
follow-up are explicit capabilities using the child identifiers.

### Failure and cancellation tree

Child `failed`, `interrupted`, and `exhausted` outcomes settle the parent task
invocation as structured results. Only an independent parent failure or parent
budget/interrupt transition ends the parent Turn.

Cancellation follows durable lineage:

- interrupting a child signals every live descendant first, settles their
  still-running Turns through terminal compare-and-set, then settles that child;
- interrupting a parent applies the same rule to its entire live descendant
  subtree before the parent can be reported terminal;
- a child that completed before cancellation keeps `completed`;
- interrupting only a child returns an interrupted task result to a still-live
  parent, which may continue;
- steering never propagates upward or downward.

The process-local coordinator may optimize traversal, but durable parent/task
links determine scope. Session-title or in-memory job-name matching is not
authority.

### Background delegation remains out of scope

The experimental background flag and source remain default-off and may stay in
the tree under Gate 5's hibernation policy. Gate 12 closure must prove that no
baseline TUI, API, configuration default, or task schema requests or returns a
detached child job. A process-local job registry may remain an implementation
mechanism only when the parent invocation synchronously awaits the ordinary
child Turn and owns its cancellation. Promoting detached delivery later
requires durable admission, delivery, ownership, notification, cancellation,
and restart semantics; synchronous child Turns do not answer those questions.

## Delegated permissions and durable learning writes

Child effective capability is computed by deny-first intersection of:

1. machine-user and LearnerHome policy;
2. parent effective capability and explicit denials;
3. Session and external-directory constraints;
4. the selected child profile's allowed ceiling;
5. the parent's explicit capability delegation for this task;
6. command-specific permission and causal requirements.

Absence at any layer denies. Task prompt text, model output, Agent name, and
child Session metadata cannot add authority. A generic filesystem write grant
does not imply a learning-domain command, and a learning command does not imply
unrelated filesystem or shell access.

The effective delegation projection is frozen with child Turn admission for
inspectability. Revocation or a new parent denial still stops not-yet-admitted
effects according to the owning permission policy; frozen provenance is not a
promise to ignore a stronger current deny.

When a child initiates a durable learning command, the command runtime receives
trusted, non-model-settable identity for:

- child Session and Turn;
- child Assistant Message and Tool Part/call;
- exact parent Turn/task chain;
- effective delegated capability and version;
- the exact learner occurrence at the causal root only when every link resolves
  to that admitted request or accepted steer.

The domain command still owns semantic effect identity, source requirements,
versions, and legal transitions. Turn lineage is provenance and execution
authority, not a universal learning-effect key.

## Cancellation, failure, and restart recovery

### Live cancellation

The Turn coordinator owns a cancellation token per live Turn and exact
parent/child links for propagation. Provider streaming, the FIFO tool lane,
permission waits, and synchronous child waits observe that token. Cancellation
does not wait on a Session lock held by the work it is cancelling; implementation
must preserve a deadlock-free ownership order.

New model/tool admission checks the durable running state after cancellation is
requested. Work that has already crossed its external-effect boundary follows
its own exact settlement/recovery contract; cancellation cannot claim it never
started.

### Provider and tool failure

A provider transport retry stays below one admitted Assistant Message. Once
the provider operation is terminal, its partial or error state is durable.
The released-v1 loop either continues legally, or the Turn settles failed.

Generic tool execution persists its exact Tool Part result before another
model operation consumes it. Learning commands additionally follow Gate 8's
transaction-first settlement. No Turn failure handler repeats a tool to “make
the Turn complete.”

### Owner loss and startup

The baseline has no durable provider-work queue and no resumed drain identity.
When the application opens the admitted native database, every durable
`running` Turn has no valid prior-process owner and is recovered as
`interrupted`, never redispatched.

Recovery coordinates with existing operation-level cleanup:

1. settle or mark admitted nonterminal Assistant/Tool state according to its
   owning recovery rule;
2. preserve completed Parts and committed learning receipts;
3. settle every orphan Turn `interrupted` with final observed counters and a
   recovery reason;
4. publish only committed recovery projections;
5. discard unpromoted steering, local queue entries, permission channels,
   cancellation tokens, provider retry state, and partial stream deltas.

Recovery follows causal time floors and is idempotent. Reopening again returns
the same terminal rows. Parent and child orphans are each settled from durable
state; recovery does not fabricate a child result into a parent that is no
longer executing.

## Session and history behavior

Within one Session, the original typed transcript remains the model-context
history while it fits. Gate 12 adds membership and terminal meaning; it does not
replace Message/Part content with an event log or Turn summary.

Compaction retains original durable items and their Turn/input/occurrence
identity. A compaction replay or summary is continuation context, not another
Turn, another learner occurrence, or durable learning truth. A recent verbatim
tail and original transcript follow the project-wide Session rule.

A fresh child Session receives only the delegated task and the bounded context
that existing/future context policy legitimately supplies. Gate 12 does not
copy the parent's entire transcript. Gate 18 later owns learning-state
projection across fresh and resumed Sessions.

### Transcript ownership and minimal unavailable-source receipts

Complete Session, Message, Part, Turn input/model/tool-candidate/invocation
membership, budget detail, and child presentation rows are Interaction
transcript state. Ordinary whole-Session deletion removes them. Gate 12 does
not retain every deleted Turn as a universal audit log.

Deletion retains a minimal Repa-owned unavailable-source receipt only while a
surviving parent task result, fork/historical presentation, child-lineage
reference, or independently owned learning receipt still cites deleted
Interaction identity. Its closed no-content shape contains only:

- exact Turn and unavailable source Session IDs;
- admission kind, admission/terminal times, and terminal outcome;
- exact parent Turn/task/depth lineage for a referenced child;
- exact causal learner-occurrence identity where valid;
- mappings from only those Assistant Message/Tool Part identities still cited
  by a surviving receipt to their deleted Turn.

It retains no learner/assistant text, attachment, task output, tool input/result,
prompt rendering, model/provider identity, budget detail, token/cost data, or
filesystem snapshot. Existing Gate 8 occurrence tombstones, first applied
settlement, and domain receipts remain owned by Gate 8/domain modules; Gate 12
links them without duplicating their semantics.

A common lookup of deleted identity returns typed `source_unavailable` plus the
minimal receipt when one survives, rather than a dangling foreign key or a fake
empty Session. When the final surviving reference disappears through its
ordinary owning deletion, the no-content receipt and unreferenced occurrence
tombstones are garbage-collected in that same transaction. Selective deletion
of still-owned learning state remains the later Data Lifecycle capability.

Admission and follow-up check the unavailable-source receipt before treating an
ID as physically new. A retained Turn/operation ID is retired and returns typed
`source_unavailable`; it can neither resume nor conflict-compare deleted
content that the receipt deliberately does not retain. When deletion proves no
receipt, effect, presentation, parent result, or other durable reference
survives, it deliberately releases that transcript-owned replay identity in the
same sense as Gate 8 releases a deleted no-effect invocation key. Destructive
deletion therefore ends exact replay for that unreferenced no-effect history;
it does not retain a universal ID graveyard.

### Revert cleanup

A running Turn cannot be reverted around. Revert does not reopen, retry, or
change a terminal Turn. Before cleanup, the existing reversible Session
projection may hide a suffix without changing durable Turn state. When cleanup
would physically remove Messages or Parts, one settlement-aware transaction
computes the complete affected Turn/item set first and applies these rules:

- removal of an original Gate 8 applied learning Part still rejects the whole
  revert as Gate 8 requires;
- allowable removed presentations become no-content item tombstones under
  their existing terminal Turn receipt, preserving exact identity, ordinal,
  item-local disposition, final counters, and Session causal time without
  preserving content;
- removing a partial Tool Part/call or only one side of a candidate/invocation
  aggregate rejects rather than producing mixed replay state;
- child/task references use the same available-or-unavailable lookup and may
  not be severed silently;
- a later prompt after cleanup is a new Turn with new identities. It never
  reopens the reverted Turn or reuses its model/tool budget.

`unrevert` before physical cleanup restores the existing projection. Injected
cleanup or tombstone failure rolls back all transcript and Turn changes.

### Fork presentation retention

Fork materialization follows the atomic root-start contract above. Each cloned
historical item links to the original occurrence, Turn, Assistant operation,
or Tool Part where one exists, but belongs to no target Turn. Removing a clone
removes only that presentation. Deleting its source while the clone survives
retains the source's minimal unavailable receipt; the clone remains explicitly
historical and never becomes a physical invocation or causal learner origin.

### Whole-Session and child-subtree deletion

The first slice refuses deletion with typed `session_tree_busy` when any Turn in
the selected subtree has a valid `admitting`, `running`, or `terminalizing`
owner. It does not turn deletion into an implicit interrupt. A same-process
ownerless `running` row is first handled by the ordinary orphan-recovery rule;
the caller can retry deletion after that exact settlement. Thus the deletion
transaction begins only with an idle/terminal subtree and never needs to roll
back a real cancellation or external effect.

Deletion then computes the complete selected Session subtree and all Gate
8/Gate 12 reference effects before mutation. Deleting a parent preserves the
inherited product behavior of deleting its descendant child Sessions, but the
entire subtree now commits in one native database transaction rather than
recursive per-Session commits.

That transaction:

- validates the complete descendant closure and all protected settlements;
- creates required Gate 8 occurrence tombstones and Gate 12 minimal unavailable
  receipts for references surviving outside the deletion closure;
- removes selected Session events, Messages, Parts, full Turn records,
  transcript-owned membership, and no-effect invocation state;
- preserves independently owned domain state, immutable receipts, and first
  applied Gate 8 settlements;
- emits deletion projections only from the committed result.

Any validation, reference-closure, tombstone, projection, or injected
storage failure rolls back the complete subtree. There is no state in which a
parent reports successful deletion while a selected child remains or a child
was deleted while the parent transaction failed.

Deleting a child subtree directly leaves its parent Session and task result
intact. That parent result continues to show the exact child IDs and terminal
outcome through the minimal `source_unavailable` receipt, while child transcript
inspection reports unavailable. Deleting the parent later may remove that
receipt when no domain or historical reference remains. A parent deletion does
not leave a live child Session behind; only the narrow receipt required by a
surviving external authority may remain.

## Program and learner surfaces

### Typed core/API contract

The shared schema must expose at least:

- start request/result and exact replay/conflict;
- steer request/result and typed race failures;
- exact-Turn interrupt request/result;
- Turn get/list/active inspection;
- Turn state, limits, counters, terminal reason, child lineage, and bounded
  child result;
- typed committed Turn events.

HTTP handlers and generated SDK use this schema. They do not independently
reconstruct active state from Session status or parse error strings. Any public
Protocol/HttpApi change regenerates the supported clients from source rather
than editing generated files.

### Terminal behavior

The terminal must:

- keep pre-first-request drafts outside durable Session state;
- **Historical 2026-07-18 mapping, suspended on 2026-07-29:** make ordinary
  Enter queue a visible editable next Turn while one is active;
- expose a discoverable configurable explicit-steer binding;
- track the exact active Turn ID used by steer and interrupt;
- show pending/unaccepted steer separately from committed history;
- **Historical 2026-07-18 fallback, suspended on 2026-07-29:** preserve a
  raced-out steer visibly as queued draft with a new start identity and an
  explicit “not steered” indication;
- collapse child Sessions/Turns by default while showing running, failed,
  interrupted, or exhausted descendants at the parent task;
- make Turn limits/counters available in inspection without routinely filling
  the conversation with budget bookkeeping;
- render exhaustion and incomplete terminal outcomes visibly.

No TUI convenience may weaken server identity checks.

### Program-owned internal operations

Title, compaction, representation, project-copy naming, shell/admin work, and
recovery remain inspectable through their current owners. If they mutate the
same Session transcript, they share the Session mutation boundary and cannot
race Turn admission or terminal settlement. They do not acquire Turn
membership merely for serialization.

## Implementation ownership

The intended dependency direction is:

```text
Core Interaction schema, Turn transitions, and unavailable receipts
  -> released-v1 Session owner reservation, admission, recovery, and subtree mutation
  -> fork-start plus common model/tool-candidate and foreground-task seams
  -> HTTP/SDK typed projection
  -> terminal queue, steer, inspection, and child presentation
```

The generic Interaction runtime owns Turn identity, counters, terminal state,
coordination, and exact execution lineage. Learning authorities may validate
and cite those trusted identities but do not query runner internals. The
released-v1 runner does not interpret Course, Artifact, learner-record, Agenda,
or policy semantics.

A narrow Turn module is justified because database transitions, API schemas,
runner checks, task lineage, and inspection all consume the same lifecycle. A
generic scheduler, manager/service/repository stack, universal command bus,
preview-v2 adapter, or compatibility facade is not justified.

Implementation must remove or close any old production entry that can create
an empty Session, ambiguously join a prompt to live work, or cancel by Session
without exact Turn identity. Retaining unsupported aliases for OpenCode API
compatibility would preserve the cause and is outside the product decision.

## Failure behavior

| Condition                                                         | Required result                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| first Session/Turn transaction fails                              | no Session, Turn, input, occurrence, or event survives                                                       |
| admission commits but owner promotion fails                       | reserved owner settles Turn interrupted before releasing admission; no provider work starts                  |
| exact running start with matching live owner                      | join/observe that owner; create and dispatch nothing new                                                     |
| exact running start with no valid live owner                      | settle same-process orphan interrupted; never leave or redispatch it                                         |
| same start ID, changed envelope                                   | typed conflict; mutate nothing                                                                               |
| new start while another Turn runs                                 | `turn_already_running`; never steer automatically                                                            |
| standalone fork preparation                                       | local draft only; no durable target Session                                                                  |
| fork-start materialization fails                                  | no target Session, clone, Turn, input, occurrence, or event survives                                         |
| steer has no active Turn                                          | `no_active_turn`; input remains unaccepted                                                                   |
| steer expected ID is stale                                        | `active_turn_mismatch`; never target actual Turn                                                             |
| completion wins steer race                                        | `turn_not_steerable`; optional visible text is `undelivered`, with no automatic start, steer, retry, or retarget |
| steer wins completion race                                        | input commits to exact Turn; loop reevaluates before next sample                                             |
| several steers wait together                                      | promote one learner occurrence per later model admission; preserve FIFO and exact causal binding             |
| model limit reached                                               | `exhausted` with model receipt; no provider operation starts                                                 |
| tool limit reached                                                | `exhausted` with tool receipt; no local tool effect starts                                                   |
| sibling calls follow exhausted trigger                            | all persisted siblings become exact linked `not_started` results; no invocation or effect starts             |
| transport retries                                                 | same model operation and budget unit                                                                         |
| exact tool settlement replay                                      | same invocation/result and budget unit                                                                       |
| provider returns partial then fails                               | partial Assistant state plus failed/incomplete Turn                                                          |
| recoverable tool error                                            | exact Tool result; Agent may continue within limits                                                          |
| unrecoverable execution error                                     | failed Turn; partial durable work retained                                                                   |
| child admission fails                                             | no orphan child Session/Turn; parent receives structured task failure                                        |
| child fails or exhausts                                           | bounded child result; parent remains live unless independently terminal                                      |
| child depth ceiling reached                                       | no child Session/Turn; parent task reports typed rejection                                                   |
| child lacks delegated capability                                  | no durable domain effect; exact denied result/receipt where owned                                            |
| delete child while parent survives                                | delete child transcript atomically; parent resolves exact IDs/outcome through no-content unavailable receipt |
| start/follow-up reuses a retained deleted identity                | typed `source_unavailable`; never materialize or resume it                                                   |
| delete a Session subtree containing live work                     | `session_tree_busy`; explicit exact-Turn interrupt remains a separate action                                 |
| parent subtree deletion fails at any descendant                   | whole idle/terminal deletion rolls back; no partial parent/child success                                     |
| interrupt child                                                   | child subtree interrupted; parent receives result and may continue                                           |
| interrupt parent                                                  | every live descendant targeted, then parent interrupted                                                      |
| process exits with running Turns                                  | startup settles them interrupted; no provider/tool redispatch                                                |
| process exits with queued/steer drafts                            | drafts may be lost and were never reported accepted                                                          |
| another Session advances shared-state time after clock regression | later model/tool admission floors to that database-wide frontier before consuming state                      |
| terminal transition repeats                                       | stored first terminal outcome wins unchanged                                                                 |

## Explicit non-goals

Gate 12 does not add:

- a second Agent runner or preview-v2 production path;
- durable provider-work replay, resumable streams, or a workflow engine;
- a durable prompt inbox, background subagents, clustered execution, or
  cross-process ownership;
- a universal event store or replacement for typed Session Messages/Parts;
- OpenCode HTTP/SDK behavior compatibility;
- learning-context projection, retained policy, Goal, learner record, Agenda,
  Assignment, Material Map, or Tutor-action taxonomy;
- automatic transcript copying between parent and child;
- blanket read-only children or blanket inherited parent permission;
- routine learner-facing budget dashboards;
- semantic deduplication by text or payload digest;
- rollback of already committed domain transitions when a Turn later fails;
- retroactive guessed Turns for historical messages;
- selective deep deletion or migration of old Repa/OpenCode user data.

## Closing evidence required

Gate 12 closes only when current evidence can falsify every material claim
below. Test names and file layout are implementation decisions; the semantic
oracles are not.

### Schema, migration, and atomic admission

- A clean native database admits a first root request as one atomic
  Session/Turn/User Message/occurrence unit.
- Gate 8-valid learner requests, including text with typed attachments, use the
  same root admission boundary; synthetic-only or otherwise non-learner input
  remains outside occurrence and Turn admission.
- Fault injection at each durable step leaves none of that unit behind.
- Interruption before admission commit drops the reserved owner and leaves no
  durable unit; forced cancellation, runner construction failure, and fiber
  registration failure after commit but before owner promotion settle the root
  Turn interrupted without starting provider work.
- An existing idle Session admits a Turn without duplicating Session identity.
- New Session creation without a root/child Turn is impossible through every
  supported TUI, HTTP, SDK, command, and internal entrypoint.
- New child Session/Turn/task input admission is atomic under the same fault
  pressure, including post-commit child-owner promotion failure.
- Standalone fork preparation creates no durable target. Fork-start fault
  injection across source snapshot, clone presentation, root input, occurrence,
  Turn, and event creation leaves none of the target aggregate behind.
- Two concurrent new starts for one Session yield one running Turn and one
  typed busy result.
- Database constraints reject a second running Turn, malformed terminal shape,
  invalid child lineage/depth, duplicate membership, and exhausted-without-
  receipt even when application validation is bypassed.
- Migration does not synthesize Turns from old text. Safe empty legacy rows are
  removed only under the stated no-reference proof; anomalies fail boundedly.

### Identity and exact replay

- Lost-response retry of root start, child start, steer promotion, model
  admission, tool admission, terminal settlement, and exhaustion returns the
  original durable result without duplicate work.
- Exact replay of a running Turn joins its matching owner; deleting or faulting
  that process-local owner forces same-process interrupted settlement before
  replay returns and never dispatches the work.
- Reusing any stable identity with a changed normalized envelope conflicts.
- Same text with new identities creates new input/Turn where otherwise legal.
- Compaction replay, fork presentation, title/representation sample, and
  provider transport retry create no Turn or learner occurrence.
- A configuration-default change cannot silently reinterpret an exact replay's
  already admitted limits.
- Every counted Assistant operation resolves to one exact current Turn input
  and runtime-bound causal occurrence. With pending learner steers A then B,
  evidence proves A is promoted and sampled first, B remains pending until a
  later safe boundary, and a child write from A cannot be attributed to B.
- A child task inherits causal occurrence only through its exact parent model
  membership; missing/broken parent causality rejects a learner-causal domain
  command even when task text copies learner prose.

### Released-v1 grouping and finite budgets

- One root request that requires several released-v1 Assistant samples and
  several tools groups all counted operations into one Turn with stable
  ordinals.
- Model and tool limits exhaust independently at the exact off-by-one boundary.
- Title, compaction, project-copy naming, and representation samples are
  excluded; their initiating Turn tool call, if any, still counts normally.
- Repeated internal-operation failure or no-progress output cannot spin around
  the model/tool counters indefinitely.
- Provider retry and exact tool replay do not increment; a genuinely new
  physical invocation does.
- The exhaustion transaction records the exact rejected attempt and proves no
  provider/tool effect began.
- With limit one and provider-emitted candidates A, B, and C, A settles once, B
  owns the one exhaustion receipt, C receives a linked sibling
  `not_started_turn_exhausted` disposition, and exact replay of B/C preserves
  those different results without another counter increment or effect.
- A provider callback raced after exhaustion cannot persist or execute a later
  candidate, and no Turn becomes reconstructably terminal with an admitted
  unsettled item or pending persisted candidate.
- Steer does not alter either stored limit or counter except through later real
  operations it causes.

### Terminal, failure, and recovery

- Normal completion requires all admitted current-Turn operations terminal and
  wins one terminal compare-and-set.
- Provider failure before output, provider failure after partial output,
  recoverable tool error, unrecoverable tool/runtime failure, learner
  interrupt, and owner loss produce the distinct accepted outcomes.
- Admission commit followed by cancellation or owner-registration failure is
  exercised for both root and child; the same live process observes and settles
  the orphan without requiring restart.
- Partial transcript content remains readable and visibly incomplete; exact
  completed tool receipts and domain writes remain truthful.
- Interrupt and completion races preserve the first valid outcome.
- Restart settles every orphan running root and child Turn interrupted,
  settles operation-level orphans through their owner, and dispatches no
  provider or tool work.
- Repeated startup recovery is idempotent and respects causal time floors.

### Start, steer, queue, and surface races

- Server/SDK `start` never auto-steers and `steer` never silently starts.
- No-active, expected-ID mismatch, terminal/non-steerable, conflict, and
  already-running results remain distinguishable through generated clients.
- Deterministic completion-vs-steer races prove both legal winners.
- Parent-waits-child steering promotes only at the parent's next safe boundary;
  exact child steering targets only the child.
- Several pending learner steers preserve FIFO and promote at most one per
  subsequent model admission; terminalization rejects every still-unpromoted
  item without claiming acceptance.
- **Historical 2026-07-18 ordinary-send oracle, suspended on 2026-07-29:**
  ordinary Enter while active remains editable/removable local queue state and
  starts a new Turn only after admission.
- Process termination loses every process-local later-selected, undelivered,
  or unpromoted-steer draft without any accepted durable item or misleading UI
  claim.
- **Historical 2026-07-18 race fallback, suspended on 2026-07-29:** the TUI
  generates a new start identity for a raced-out steer. The current correction
  instead requires an undelivered state with no automatic start or retarget.
- Help and configured keymap discovery expose explicit steer.

### Child Turns, results, permissions, and cancellation

- Root depth, nested trusted depth, ceiling rejection, exact parent Turn/task
  linkage, and one-running-Turn-per-child-Session constraints pass.
- Parent and child budgets/counters remain independent; parent task invocation
  counts once.
- Child failed/exhausted/interrupted results do not automatically terminate the
  parent.
- Parent receives only the bounded requested result envelope; transcript and
  tool history remain discoverable only through exact child inspection or
  follow-up.
- Exact authorized child Session follow-up creates a new Turn; name/description
  matching and arbitrary `task_id` adoption fail.
- Child interrupt cancels its subtree and returns to the parent; parent
  interrupt cancels all descendants; completed descendants remain completed.
- Capability-intersection tests prove every deny source, explicit delegation,
  stronger specialist rejection, and prompt-text non-authority.
- An authorized child learning command records actual child operation,
  invocation, parent task chain, and valid causal-root occurrence; broken
  lineage or absent delegation produces no domain write.
- Baseline schemas, config, TUI, and HTTP cannot request or observe detached
  background delivery even though hibernated source remains.

### Causal time, revert, fork, and deletion

- Session A commits shared learning state, the wall clock regresses, and model
  sampling plus local-tool execution in Session B both record times floored to
  the database-wide shared-state frontier before consuming that state. Exact
  replay keeps its original time, and unrelated transcript rows gain no fake
  global ordering.
- Revert projection alone changes no Turn. Cleanup of an allowable terminal
  suffix atomically retains no-content item/Turn truth and a later prompt starts
  a new Turn; cleanup crossing an applied Gate 8 Part or partial candidate/
  invocation aggregate rejects without mutation.
- Fork-start atomically materializes historical presentations plus one genuine
  root Turn. Clones consume no budget and remain historical after source
  deletion through available-or-unavailable receipt lookup.
- Direct child-subtree deletion leaves the parent task result resolvable as
  `source_unavailable` with exact child Turn/outcome and no child transcript.
- Parent deletion precomputes and commits its full child subtree in one
  transaction; injected failure at any descendant leaves the whole tree and
  projections unchanged.
- A valid live descendant causes typed `session_tree_busy` with no deletion or
  implicit interrupt. After a separately authorized exact interrupt settles,
  retry deletes the now-terminal subtree; an observed ownerless row follows the
  ordinary same-process orphan rule before deletion is retried.
- A child that committed a durable learning command can lose its transcript
  while its exact Gate 8 settlement, domain state, and minimum Turn/operation
  lineage remain. A subtree with no surviving parent, historical, child, or
  domain reference leaves no unnecessary Gate 12 audit rows after deletion.

### Integration and production-path evidence

- Focused package tests and typechecks cover the actual Core, released-v1
  runner, task, server/client, and terminal dependency reach.
- Public HttpApi/Protocol changes regenerate SDKs, and source-generation drift
  is clean.
- A packaged Windows terminal run proves first draft admission, visible local
  queue, fork draft/start, explicit steer, child collapse/failure, interrupt,
  unavailable-child projection, and restart behavior where packaging can affect
  behavior.
- One maintainer-authorized configured-provider trace, if still causally needed
  after deterministic provider-seam evidence, proves that a real released-v1
  sample/tool/continuation chain maps to one Turn without counting provider
  transport or internal samples incorrectly.
- Source and bundle inspection prove the production entrypoint still uses one
  released-v1 loop, preview-v2 execution remains unreachable, and background
  delivery remains default-off and unreachable.

Evidence must use exact current commit, configuration, package, and platform
identity. A reviewer may narrow an expensive run only when existing evidence
already falsifies the same claim; confidence alone cannot waive a material
oracle.

## Design evidence provenance

Primary project authority:

- `docs/decisions/0005-durable-turn-and-interaction-hierarchy.md`
- `docs/decisions/0007-process-local-coordination-and-finite-turns.md`
- `docs/decisions/0008-model-write-initiative-and-durable-authority.md`
- `docs/decisions/0009-separate-invocation-and-semantic-effect-identity.md`
- `docs/decisions/0012-learning-centered-modular-monolith.md`
- `docs/decisions/0014-one-time-opencode-fork.md`
- `docs/roadmap/09-one-time-opencode-fork-baseline.md`
- `docs/research/opencode-fork-gate-08-learning-command-settlement-2026-07-16.md`

Current fork implementation evidence:

- `packages/core/src/turn/`
- `packages/core/src/learning-frontier.ts`
- `packages/core/src/database/schema-extras.ts`
- `packages/core/src/database/migration/repa/20260718134404_gate12_durable_turn.ts`
- `packages/core/src/session/sql.ts`
- `packages/core/src/learning-command/occurrence.sql.ts`
- `packages/core/src/learning-command/settlement.ts`
- `packages/opencode/src/session/session.ts`
- `packages/opencode/src/session/lifecycle.ts`
- `packages/opencode/src/session/prompt.ts`
- `packages/opencode/src/session/processor.ts`
- `packages/opencode/src/session/revert.ts`
- `packages/opencode/src/session/run-state.ts`
- `packages/opencode/src/session/turn-events.ts`
- `packages/opencode/src/session/turn-recovery.ts`
- `packages/opencode/src/effect/runner.ts`
- `packages/opencode/src/tool/task.ts`
- `packages/opencode/src/agent/subagent-permissions.ts`
- `packages/opencode/src/cli/cmd/run/runtime.queue.ts`
- `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts`
- `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts`

Pinned lineage and secondary reference:

- OpenCode fork origin: `v1.17.18` /
  `b1fc8113948b518835c2a39ece49553cffe9b30c`
- Codex secondary reference: `rust-v0.144.1` /
  `44918ea10c0f99151c6710411b4322c2f5c96bea`
- Codex exact steer schema:
  `codex-rs/app-server-protocol/src/protocol/v2/turn.rs`
- Codex TUI exact active-Turn routing and queue/steer keys:
  `codex-rs/tui/src/app/thread_routing.rs` and
  `codex-rs/tui/src/bottom_pane/chat_composer.rs`
- Codex generic start path deliberately not copied:
  `codex-rs/core/src/session/handlers.rs`
- Codex child wait result comparison:
  `codex-rs/core/src/tools/handlers/multi_agents_spec.rs`

The local reference paths are not durable authority; exact pins are recorded
in the [fork ledger](../fork-ledger.md).

## First implementation/evidence candidate

The first reviewed candidate implements the accepted boundary in the existing
released-v1 processor rather than adding another runner:

- Core owns durable Turn, input, model-operation, candidate, invocation,
  terminal, exhaustion, child-lineage, unavailable-source receipt, and
  database-wide learning-frontier truth. Schema constraints, the forward
  migration, same-transaction deletion/garbage collection, and recovery keep
  those records closed under the admitted lifecycles.
- The Session owner reserves admission through live handoff, reconciles exact
  replay, serializes FIFO steers at safe model boundaries, and terminally
  settles owner loss without replaying provider work. Each model operation is
  bound to one trusted input occurrence and immutable context/frontier
  snapshot.
- The released-v1 processor registers and seals a provider-emitted candidate
  set before FIFO tool admission. Independent model/tool budgets, exact
  exhaustion ownership, sibling disposition, partial output, and one terminal
  CAS remain durable and reconstructable.
- Task delegation creates a synchronous child Turn in an independent child
  Session with explicit non-escalating capabilities, bounded depth and subtree
  budgets, exact causal lineage, cancellation propagation, and a bounded
  task-shaped result. Background delivery is absent from the production
  surface.
- Strict start, expected-Turn steer, expected-Turn interrupt, atomic fork-draft
  materialization, typed unavailable-child projection, HttpApi/SDK/CLI/TUI
  surfaces, and startup recovery all use that same owner. Retired legacy and
  preview-v2 execution entries cannot create released-v1 work through a second
  path.

Focused evidence submitted with that candidate included:

- Core Turn evidence passed 16 tests / 114 assertions. Migration, event, and
  learning-settlement evidence passed 85 tests / 313 assertions, and the final
  migration regeneration check reported no incremental schema drift.
- Released-v1 prompt/steer/frontier evidence passed 6 tests / 54 assertions;
  recovery plus task evidence passed 9 / 53; learning-command runtime evidence
  passed 10 / 98; processor candidate/budget evidence passed 27 / 140 (the
  retained reviewer's fresh count, correcting the earlier 138-count record);
  and the admission/handoff/race matrix passed 7 / 46. The CLI group passed 60
  tests / 189 assertions with five explicit skips.
- Server SDK/OpenAPI/Session-action evidence passed 46 tests / 273 assertions.
  The exact Gate 12 HttpApi effect slice passed 7/7 with no skip, missing, or
  extra operation. The full operation inventory and authenticated-request
  matrices each exercised 182/182 public operations.
- TUI key routing, fork-draft, and Session-start location evidence passed 5
  tests / 19 assertions. It proves ordinary Enter and explicit steer normalize
  to disjoint bindings.
- Final typechecks passed in all seven affected packages: Core, Schema,
  OpenCode, Plugin, legacy JavaScript SDK, Client, and TUI. Client generation
  was idempotent across nine generated files; legacy SDK generation was
  idempotent across fifteen. The Windows-only generated-file retry preserves
  the same bytes while tolerating transient file-access races.
- Source and generated-surface inspection found one interactive released-v1
  provider stream, no retired public start/command/cancel/fork entry, no public
  preview-v2 Session execution route, and no reachable background-subagent
  delivery surface. Both pinned reference checkouts remained clean at their
  recorded commits.

One broader HttpApi effect diagnostic passed 177/182 operations. Its five
failures were outside the Gate 12 released-v1 Turn surface: legacy and
preview-v2 PTY creation, two stale isolated-auth-path oracles, and one
preview-v2 `permission.create` fixture. This candidate does not claim that
broader diagnostic is green; the exact Gate 12 slice, operation inventory, and
authentication matrix above are the relevant passing evidence.

The single authorized Windows x64 package build passed its built-in executable,
ContentRoot native, PDF-worker, and parent-to-worker cancellation/reap smokes.
A real Windows ConPTY run against an isolated home/database and deterministic
local SSE provider additionally proved that a typed but unsubmitted draft
creates no Session, while submitting `first packaged draft` atomically creates
exactly one Session, learner Turn, root input/occurrence, User Message/Part, and
admitted model operation. The TUI visibly projected the active Turn as
`esc interrupt`; harness teardown later settled it `interrupted/owner_lost`.

That packaged oracle is deliberately partial. Its external harness failed to
normalize ANSI before a queue-marker assertion, and a later readiness fetch
hung. It therefore did not prove the packaged queue marker, same-Turn steer,
fork materialization, child success/failure/unavailable projections, learner
interrupt and exact replay, restart orphan recovery, or process-local queued
draft loss. These are unproved packaged scenarios, not observed product
failures. No second package build was run. At that transition, deterministic
package-level tests covered their program semantics, and the retained reviewer
still had to decide whether those tests plus the successful
packaging-sensitive first-admission trace falsified the contract's
production-path risks or whether another bounded packaged oracle was required.

That initial implementation/evidence candidate was not accepted. Its repairs
returned to the same reviewer task, preserving one Gate 12 acceptance owner.

## Independent implementation review state

The retained reviewer first returned `Revise` for the implementation/evidence
layer on 2026-07-19. Contract/theory remained accepted and no maintainer-owned
product decision was reopened. After the executor repaired the seven findings
and one further derived fork-chronology defect disclosed by the replacement
package oracle, the same reviewer reran every counterexample and returned
`Accept`.

| Finding      | Required repair boundary                                                                                                                            | Current disposition          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `G12-IE-001` | Release the owner permit before interrupting/joining a cancelled post-commit handoff, and prove root/child terminal replay with no dispatched work. | Closed by the same reviewer. |
| `G12-IE-002` | Preserve the real parent and inherited deny-first authority through child and grandchild capability freezing.                                       | Closed by the same reviewer. |
| `G12-IE-003` | Make subordinate Turn causal identity, provenance, frozen authority, historical links, and unavailable mappings immutable at the SQLite boundary.   | Closed by the same reviewer. |
| `G12-IE-004` | Prevent deletion or regression of the database-wide learning frontier.                                                                              | Closed by the same reviewer. |
| `G12-IE-005` | Capture the exact Turn visible when the learner steers or interrupts; never query and retarget its replacement.                                     | Closed by the same reviewer. |
| `G12-IE-006` | Prove whole-subtree rollback after prepared receipts and Gate 8 learning-settlement retention/final-reference GC.                                   | Closed by the same reviewer. |
| `G12-IE-007` | Reconcile snapshot provenance, then build and exercise one exact Windows packaged candidate across every packaging-sensitive clause still required. | Closed by the same reviewer. |
| `G12-IE-008` | Order fork history by durable creation time plus ID so a fresh historical clone ID cannot outrank the genuine newer root.                           | Closed by the same reviewer. |

The final implementation/evidence review ran from
`2026-07-19T00:33:52.934Z` through `2026-07-19T06:48:59.330Z`. It accepted the
production-seam A-to-B steer/interrupt test as causally equivalent to an
external ConPTY pause, found no new blocker, and left the repository and
retained artifacts unmodified.

## Repaired implementation/evidence candidate

The executor completed all seven requested repairs without reopening the
accepted contract or adding a second runner:

- `G12-IE-001`: caller cancellation now records terminalizing intent while it
  owns the admission permit, releases that permit before interrupting/joining
  the handoff fiber, and makes promotion observe terminalization. Root and
  delegated-child paused post-commit tests prove `owner_handoff_failed`, zero
  work dispatch, owner release, and exact terminal replay.
- `G12-IE-002`: delegated capability version 2 retains the actual parent base,
  inherited ancestor authority, child profile, and explicit delegation as
  separate absence-deny layers. Root-to-child and child-to-grandchild tests
  prove that a broad delegated `read:**` cannot erase a narrower
  `read:secret/**` deny.
- `G12-IE-003`: SQLite triggers freeze subordinate Turn input, model-operation,
  tool-candidate/invocation, child-lineage/result, historical-presentation, and
  unavailable-receipt identity/provenance while preserving their legal
  lifecycle transitions. Direct-SQL bypass tests cover causal membership,
  fingerprints/frontiers, ordinals/owners, delegated capability, result
  identity, historical links, and unavailable mappings.
- `G12-IE-004`: the database-wide learning frontier now materializes only at
  `0/0`, advances by exactly one nondecreasing transition, cannot be deleted,
  and cannot be regressed through update or `INSERT OR REPLACE`. Direct-SQL
  attacks followed by cross-Session admission-floor checks prove the boundary.
- `G12-IE-005`: Sync owns the exact visible active Turn ID. Steer and interrupt
  capture that ID synchronously and dispatch it unchanged. **Historical
  2026-07-19 TUI fallback, suspended on 2026-07-29:** a raced-out steer became
  an explicit editable new-Turn draft. The corrective contract retains exact
  capture/no retargeting but instead leaves the complete text `undelivered`
  until a new learner choice.
- `G12-IE-006`: new transactional oracles inject failure after preparing
  parent-plus-descendant unavailable receipts and prove complete subtree and
  projection rollback. A separate admitted Gate 12 model/tool plus applied
  Gate 8 learning-settlement oracle proves domain settlement and exact
  unavailable mappings survive deletion, then disappear only with the final
  owner.
- `G12-IE-007`: provenance now uses the stated byte-ordinal algorithm, the
  repaired exact candidate was rebuilt, and one retained Windows package was
  exercised across the remaining packaging-sensitive lifecycle.

The replacement packaged oracle also found `G12-IE-008`, one derived
released-v1 defect not visible in the first review snapshot. Fork clones
receive fresh Message IDs after the genuine root ID while retaining their older
creation times; the loop had treated the larger clone ID as a newer completed
assistant and exited before sampling the root. Message selection and
completion ordering now use the durable `(created time, ID)` key. A focused
counterexample and an actual fork-start HttpApi test pass, and the package was
rebuilt only after that repair.

Fresh executor evidence for the repaired source includes:

- Core Turn tests: 20 / 20 tests, 172 assertions. Core migration tests: 26 / 26,
  126 assertions. Event plus both learning-settlement suites: 59 / 59, 187
  assertions. Core typecheck and migration regeneration/check both pass.
- Released-v1 prompt, processor, recovery, Task, and both learning-command
  runtime suites: 54 / 54 tests, 358 assertions. Fork chronology selection:
  37 / 37, 63 assertions. Atomic fork-start HttpApi counterexample: 1 / 1, 13
  assertions. Admission/handoff fault matrix: 8 / 8, 50 assertions. OpenCode
  typecheck passes.
- TUI Sync, visible-Turn, key-routing, fork-draft, and start-location evidence:
  20 / 20 tests, 73 assertions. The exact A-to-B identity subset was rerun as
  18 / 18 tests, 59 assertions, and TUI typecheck passes.
- The repair paths pass Prettier; `git diff --check` reports no whitespace error
  and only the existing LF-to-CRLF working-copy warnings.

### Exact repaired Windows candidate

The build source manifest implements the documented algorithm: sort changed
paths by UTF-8 byte order, then hash `path UTF-8 + NUL + ASCII decimal byte
length + NUL + file bytes`. Two pre-build captures and one post-build capture
were byte-identical. They record HEAD
`64a77fd3a6a3d13747f1312f029b9d4c48682752`, branch
`codex/opencode-v1.17.18-baseline`, 169 paths (146 tracked and 23 untracked),
4,752,171 bytes, aggregate
`F469C6186FDE5961D0100212097DA25C123EC597CFF821EC8365491C46695AD6`,
and raw porcelain-v1-z status hash
`77425AA8F88E501ADD80338DCB3AB7F4D0B800B1439666EB0A6A7DE36640A9B8`.
The manifest file hash is
`605F53CC6FF63A040E252DF5501EFEE681C5B307A9C124F0AA64E189F688AE58`.
This resolves the first review's provenance discrepancy: the earlier executor
implementation used culture-dependent sorting while describing ordinal
sorting.

The exact Windows x64 build identifies itself as
`0.0.0-codex/opencode-v1.17.18-baseline-202607190010`. Its executable,
ContentRoot native, local PDF-worker, and parent-to-worker cancellation/reap
smokes all pass. The copied evidence package and `dist` each contain 209 files
and 248,173,621 bytes with aggregate
`8FB179648E3E34ECF38DB9C24EB04E83A8AD3C57F9193A9204F608F15F943753`.
The packaged `repa.exe` hash is
`C735FBFFF65A6326512A474340B0727A9DE83EFBD03F496146F3C735101A6F9A`.

The final ConPTY oracle ran on Windows x64 under Node `v22.19.0`, directly
loading the same installed `@lydell/node-pty` CJS binding. Earlier Bun-hosted
attempts could render but could not write the draft through the native PTY;
retained diagnostics isolate that harness boundary and are not product-failure
evidence. The final report retains the complete deterministic-provider config
(SHA-256
`D160993265FD7D199B107943D34B54C4384AD7F65C31865476CD279F6E91A83D`)
and its exact ephemeral base URL `http://127.0.0.1:30621/v1`.

The final report is `ok: true` and proves:

1. a typed draft creates no Session; submit atomically creates the first
   Session/running learner Turn; the visible local queue does not create a
   replacement; explicit steer completes that same Turn with two model
   operations;
2. a process-local fork draft creates no target, then submit atomically creates
   the historical target plus one genuine root Turn that completes after one
   model operation;
3. synchronous child success and provider failure return bounded complete and
   incomplete parent results with canonical child identity;
4. child deletion preserves the parent result, renders `source unavailable`,
   and returns typed HTTP 410 `TurnSourceUnavailableError`;
5. packaged TUI interrupt produces `learner_interrupt`; exact replay returns the
   same terminal result without another provider request;
6. hard process loss followed by restart produces `startup_recovery`, leaves
   provider requests at 11 before and after recovery, keeps Turn count at 5,
   reports no active Turn, and neither durably materializes nor visibly restores
   the local queued draft.

All 12 deterministic provider requests were consumed (11 interaction and one
title request), with zero pending queue items. Only the A-to-B handler
micro-race is narrowed to causally equivalent deterministic evidence: the
packaged run exercises the same captured-ID steer and interrupt production
surface, while the Sync/helper tests capture visible Turn A, replace current
state with Turn B before dispatch, then prove both delayed actions still target
A. This avoids adding a test-only pause seam to the production TUI.

The retained repaired-artifact root is
`C:\Users\Discordance\.codex\visualizations\2026\07\18\019f7393-89cb-7e83-a34b-f9fd92a28500\gate12-repair-evidence\windows-packaged`.
`oracle-report.json` hashes to
`2DA0C4BF0F44B87B513686151938376BB84C434473266535ABDBF19D124A35CD`;
the ANSI-free terminal record contains no escape character and hashes to
`9058F51B90DC3CA54FBFF2C8A96CD9301AB6F83175557EC1F1779BDBEDAC8F83`.
The exact oracle source is retained in the sibling path
`C:\Users\Discordance\.codex\visualizations\2026\07\18\019f7393-89cb-7e83-a34b-f9fd92a28500\gate12-windows-packaged-evidence\oracle.ts`
and hashes to
`4AEE7EC8B144BD51EEA2D600CA6CAD0196921DC912E6182A95588CA6645B7BFD`.
The reviewer independently recomputed the source and package manifests, matched
these exact artifacts, reran the repaired counterexamples, and accepted the
implementation/evidence layer.

## Independent contract review state

Independent top-level review run `gate12-20260718-whole-01` began in task
`019f7443-f008-7243-8016-f78b5ced55e7` with no inherited dialogue and returned
`Revise` for the contract/theory layer. The executor accepted all six findings
as derived engineering corrections. No maintainer-owned product choice was
reopened, and no implementation had begun at that review transition.

| Finding      | Repaired contract boundary                                                                                                                                                  | Current disposition                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `G12-CT-001` | Retire standalone durable fork creation; materialize an exact historical fork only atomically with a genuine new root Turn.                                                 | Closed by the same reviewer.                                         |
| `G12-CT-002` | Reserve the Session/Turn owner before admission commit; promote interruption-masked or settle same-process orphan `interrupted` before release/replay.                      | Closed by the same reviewer.                                         |
| `G12-CT-003` | Seal one causal-input window per model operation, promote at most one learner steer at each safe boundary, and carry the runtime-bound occurrence through child delegation. | Closed by the same reviewer.                                         |
| `G12-CT-004` | Seal each emitted candidate set and terminally disposition the exhaustion trigger plus every persisted sibling before the Turn is reconstructably terminal.                 | Closed by the same reviewer; implementation evidence later accepted. |
| `G12-CT-005` | Separate transcript-owned rows from minimal no-content receipts and make revert/fork/child and whole-subtree deletion settlement-aware and atomic.                          | Closed by the same reviewer.                                         |
| `G12-CT-006` | Carry ADR-0005's database-wide shared-state frontier through exact model snapshots, tool admission/effects, recovery, and cross-Session evidence.                           | Closed by the same reviewer.                                         |

The same reviewer accepted the contract/theory layer after rerunning the
original counterexamples. In the later implementation/evidence closure, it
also reran the intended falsification targets:

1. whether the candidate records are sufficient without becoming a second
   runner or universal event store;
2. whether admission, completion, steer, interrupt, budget, and recovery races
   have one atomic owner and no ambiguous public fallback;
3. whether root/child identity and capability rules preserve Gate 8 causality
   without copying a parent transcript or granting authority by prose;
4. whether partial output, committed domain writes, and terminal outcomes remain
   semantically distinct;
5. whether the required evidence can actually falsify production-path and
   restart claims.

Both historical review layers were accepted. At the 2026-07-18 boundary, Gate
12 was formally closed and its reviewed implementation was integrated at commit
`80f5fa30a`; the later correction below changes only the current disposition of
the primary-TUI mapping.

## 2026-07-29 primary-TUI delivery correction candidate

The historical close proved that an admitted steer joins only the exact running
Turn and that an unpromoted next-Turn draft remains process-local, editable, and
truthfully losable. It did not prove that the chosen default kept immediate
learner correction natural. In the shipped mapping, a learner can type “等等，
我说的是右特征向量” during a mistaken explanation and press ordinary Enter;
the current model/tool work continues, while the correction waits for a later
root Turn and may disappear on process exit. The busy footer shows only the
interrupt action before that first miss. Its steer hint appears afterward in
internal Turn vocabulary and hard-codes `Ctrl+Enter` even though the keymap is
configurable.

The correction boundary is:

1. When no Turn is running, ordinary send admits a new root Turn exactly as the
   accepted implementation already does.
2. When one Turn is visibly running, the TUI offers both current-work delivery
   and later delivery. Current-work delivery synchronously captures that exact
   visible Turn and calls the existing strict steer primitive; it never
   discovers or retargets a replacement Turn later.
3. Before the first busy submission, the composer shows both configured
   bindings in learner language such as “add to this response” and “send after
   this response.” Learners need not understand Turn, steer, admission, or
   internal identifiers.
4. **Maintainer decision, 2026-07-29:** while a Turn is visibly running,
   ordinary Enter selects “send after this response”; the separate configured
   current-work action selects “add to/correct this response.” The error policy
   is deliberately asymmetric. A later-selected draft is still unadmitted,
   editable, removable, and may be reselected for current work, while an
   accepted current-work steer has already entered the current Turn's context,
   budget, cancellation, and terminal fate and cannot be extracted as an
   independent next question. The reversible error therefore owns the ordinary
   action. This decision may be revised by the maintainer if observed learner
   behavior shows that discoverable current-work delivery still makes timely
   correction unreasonably difficult.
5. The process-local composer distinguishes these legal states without
   introducing a durable queue or learning fact:
   - `editing`: the complete current composer payload has no pending delivery
      choice;
   - `later_selected`: while busy, ordinary Enter is an explicit later choice
     because the composer already labels its configured meaning. The payload
     stays visible, editable, removable, and eligible for explicit
     reclassification to current work while the captured active Turn runs.
     When that Turn leaves active state, the TUI gets one opportunity to
     atomically snapshot the complete then-current payload and call strict
     `start`;
   - `undelivered`: a current-work steer that loses its exact-Turn race, or a
     later-selected strict `start` that loses to another Turn, enters this state
     with the complete payload and truthful reason visible. It has no automatic
     start, steer, later retry, or retarget. Only a new learner choice may send
     it or mark it later again.
6. Editing or removing a `later_selected` payload changes what can be delivered;
   no stale earlier text is submitted. While the captured Turn remains the
   exact visible active target, choosing current work atomically consumes the
   later selection into one complete-payload strict-steer attempt. When the
   captured Turn leaves active state, later promotion instead atomically
   consumes it into one complete-payload strict-start attempt. Those paths
   cannot both dispatch. Successful strict steer or strict start is the only
   admission boundary; a lost race becomes `undelivered` rather than steering a
   replacement Turn, retrying later, or silently waiting for another completion.
7. Process exit or crash may lose `editing`, `later_selected`, and
   `undelivered`; the TUI never describes them as durably saved. The accepted
   persisted steer FIFO, child behavior, interrupt, cancellation, and recovery
   semantics remain unchanged.

The pinned Codex comparison at `rust-v0.144.1` /
`44918ea10c0f99151c6710411b4322c2f5c96bea` demonstrates the mature interaction
shape in `codex-rs/tui/src/bottom_pane/chat_composer.rs` and `footer.rs`:
ordinary Enter delivers to current work and an explicit action queues later.
That reference establishes feasibility, not Repa's default. Repa keeps its own
keymap, strict exact-Turn API, safe promotion, and failure behavior.

Focused closing evidence must show ordinary busy Enter selecting later delivery
and staying editable and unadmitted until one complete-payload strict-start
snapshot; edit, removal, and explicit reclassification to current work before
that snapshot; the configured current-work action reaching exact Turn A;
learner-facing binding labels before first use; an immediate correction that can
still be delivered to A; an independent next question that remains outside A;
one-winner current-versus-later dispatch; current-work completion-race
transition to `undelivered`; later-promotion loss to another Turn without steer,
retry, or retarget; and restart loss without a false durable claim. HTTP and SDK
continue exposing strict start and exact-target steer primitives; this
correction does not add a generic start-or-steer API or require a semantic
classifier to override the learner's delivery choice.

This is a material correction to one earlier accepted product choice.
Implementation and replacement closing evidence must wait for
`G12-RC-001` through `G12-RC-003` to close in the original fresh separate
top-level reviewer task. `G12-RC-002` is addressed by the explicit suspension
of the old terminal/default clauses above. `G12-RC-003` is addressed by the
`editing` / `later_selected` / `undelivered` transition and focused race
oracles. `G12-RC-001` is addressed by the maintainer-owned ordinary
Enter-to-later decision and its reversible-error policy. The historical
implementation and evidence remain valid for every unaffected Gate 12
invariant. The original reviewer returned second-pass exact-diff `Accept` with
no blocker. This contract now authorizes only the scoped primary-TUI
busy-input/discoverability/process-local delivery-state implementation and
focused replacement evidence; strict start/exact-target steer, Turn/race,
budget/tool/child/cancellation/recovery mechanics, and HTTP/SDK primitives
remain accepted and unchanged.

## 2026-07-29 corrective implementation/evidence candidate

The candidate changes only the primary TUI composer, its stash dialog, and
focused keymap/behavior tests:

- `packages/tui/src/component/prompt/index.tsx`;
- `packages/tui/src/component/dialog-stash.tsx`;
- `packages/tui/src/config/keybind.ts`;
- `packages/tui/test/cli/tui/prompt-busy-delivery.test.tsx`; and
- `packages/tui/test/keymap.test.tsx`.

Busy normal-mode Enter now captures exact visible Turn A and selects one
process-local `later_selected` draft. Selection performs no API call, history
write, or stash write; the complete latest text and structured parts remain
editable or removable. Only a settled `idle` status with no active Turn may
claim that selection for one strict start. A terminal event for A arriving
before idle therefore waits. If Turn B becomes active first, the draft becomes
`undelivered` without a start or steer and does not promote after B finishes.

The configured current-response action is visible in learner language before
first use and claims the same draft for one exact-A steer. Current and later
paths share one in-flight/selection claim. A changed target, failed strict
start/steer, lost server-admission race, disabled composer, changed Session, or
other precondition loss preserves the full draft as `undelivered`; none starts,
steers, retries, or retargets automatically. Shell mode hides both learning
delivery choices. The footer renders the actual configured bindings, stacks on
narrow terminals, and labels the local draft `this window only`.

Executor integration review found one additional event-order counterexample
after the first passing candidate: `turn.terminal(A)` could clear active A
before `session.status(idle)` and trigger an early start. The repair now waits
through the transient busy/no-active state and adds both terminal-before-idle
and B-before-promotion traces.

The original reviewer found two further admission races in the first
implementation/evidence pass. `G12-RC-IE-001` showed that the textarea's two
IME-flush timers also deferred capture of target A and the ordinary-Enter
delivery intent; a synchronously arriving B could therefore become the draft's
new anchor. The repaired handler captures the Session, exact visible target,
delivery intent, and selected state synchronously in the key event, claims the
composer immediately, and defers only the final composed-text flush.
`G12-RC-IE-002` showed that an external editor, clipboard/local-file paste, or
stash dialog started before that claim could resume afterward and mutate the
atomic snapshot. A monotonically increasing edit revision now invalidates
those asynchronous continuations, delivery-pending disables the remaining
composer mutations, and the stash dialog checks the claim before removing an
entry. The focused oracles freeze A before both timers and resolve a pre-claim
paste after dispatch to prove that neither target nor claimed payload can
change.

The first exact-diff closure closed `G12-RC-IE-002` but found one surviving
`G12-RC-IE-001` trace: Enter on A, terminal A, start B, terminal B, and idle
could all occur before `runSubmission`. Because the first repair observed only
the final active Turn, it then materialized `later_selected` after B and
automatically started the draft. The prompt now increments a local monotonic
revision on every same-Session `turn.started`, captures that revision with A,
and stores it in `later_selected`. Both deferred materialization and later
promotion compare the captured revision with the live revision, so the fact
that B appeared cannot disappear when B terminates. A focused oracle emits the
entire B start/terminal/idle cycle before either IME timer and requires a
visible `undelivered` draft with zero start or steer.

Fresh package evidence from `packages/tui`:

```text
bun test test/cli/tui/prompt-busy-delivery.test.tsx test/keymap.test.tsx test/util/visible-turn.test.ts test/cli/tui/prompt-submit-race.test.ts
19 pass, 0 fail, 58 assertions

bun run typecheck
pass
```

Changed-file oxlint reports zero errors and 22 existing-style warnings;
Prettier is clean, and scoped `git diff --check` passes. The exact tracked
four-file implementation diff hashes to
`2e027dc139174ad2ff7530e2d4073814e7fe395e`; the untracked focused test blob
hashes to `0e601d722d68eb254862241b6b3cbf0db65b5886`. No new packaged process-crash
run was performed: this correction changes no restart or durable Turn
mechanism, and its process-local truth is tested through the explicit `this
window only` projection plus absence of prompt-history/stash writes before
admission. The retained historical restart evidence continues to own the
unaffected core. The original reviewer returned second
implementation/evidence exact-diff `Accept` with no blocker.
`G12-RC-IE-001` closed against tracked implementation diff
`2e027dc139174ad2ff7530e2d4073814e7fe395e`, focused-test blob
`0e601d722d68eb254862241b6b3cbf0db65b5886`, and Gate-record diff
`ca857807ae15fbb2c34215ee586c050522cea22e`; `G12-RC-IE-002` remains closed.
The reviewer independently reproduced 19 passes, 0 failures, and 58 assertions.
Scoped Gate 12 implementation/evidence is accepted and integrated at
`c5ea10b8ab0f573fef03b5066bbcb117a9e0a502`. This acceptance does not reopen or replace the retained strict
start/exact-target steer, Turn/race/budget/tool/child/cancellation/recovery,
HTTP/SDK, or historical core evidence.

## 2026-07-31 exact owner-handoff correction candidate

Gate 14's first real OAuth/model qualification exposed a narrower Gate 12
implementation counterexample without changing the accepted Turn contract. A
Turn could win terminal CAS and become readable as terminal while its exact
same-process owner was still publishing idle and finishing internal Session
work. `awaitTurn` returned immediately for any non-running durable row, and
owner removal occurred on several earlier terminal paths. A learner's next
message in the same Session could therefore receive `Busy` after the previous
Turn had apparently completed.

The inherited released-v1 prompt path made that window materially larger:
title generation, first-step summary, per-step summary, and post-loop
compaction pruning were forked into a Session-wide Scope. Repa's later durable
Session/Turn locking made those formerly detached jobs retain the Session
outside the Turn that caused them. The fork preserved both pieces of code, but
their new composition no longer preserved OpenCode's original lifecycle
assumption.

The unstaged correction keeps one owner through the whole handoff:

- owner removal is the finalizer of the exact handoff fiber rather than an
  earlier consequence of terminal settlement or recovery;
- `awaitTurn` joins that exact handoff when the matching owner is still present,
  even if the durable Turn has already terminalized;
- title work remains concurrent with the model loop but is joined before the
  handoff ends; first-step and per-step summary plus post-loop prune are awaited
  inside the same handoff and log their own non-fatal failures; and
- no new Turn state, queue, retry, provider replay, or durable recovery meaning
  is added.

The Session summary correction triggered by the same run is owned by Gate 8:
derived file diffs no longer mutate the frozen User Message that admits a
learning occurrence. Gate 12 owns only the fact that this work completes or
fails inside its causing Turn handoff.

Fresh causal evidence from `packages/opencode`:

```text
bun test --timeout 20000 test/session/session.test.ts
31 pass, 0 fail, 217 assertions

bun test --timeout 20000 test/session/prompt.test.ts
13 pass, 0 fail, 106 assertions

bun test --timeout 20000 test/session/processor-effect.test.ts
30 pass, 0 fail, 158 assertions
```

The focused oracles cover terminal-before-await owner cleanup, later strict
start exclusion while title/summary/prune is still active, exact steer
promotion after a real completed model sample, fork source lifecycle, whole
Session deletion, and existing recovery races. Several historical tests were
also repaired to use legal current fixtures: physical invocations now admit
before terminal settlement, steer promotion includes its required model
operation, and fork exclusion pauses the actual source lifecycle guard rather
than an obsolete post-commit event callback.

This is a scoped implementation/evidence candidate, not a contract revision or
an integration. The accepted primary-TUI correction at `c5ea10b8a` and every
unaffected strict start/steer, budget, child, cancellation, recovery, HTTP, and
SDK boundary remain retained. Independent implementation/evidence closure is
required before this correction is integrated.

### Owner-handoff exact-diff review and repair

The original Gate 12 reviewer returned `Revise` on the first seven-path
candidate with two blockers:

- `G12-OH-001`: the Turn runner published promotion-ready `idle` while its
  lifecycle admission and exact terminal owner were still held. A distinct
  Turn B started directly by that idle listener therefore received
  `AlreadyRunning`/`Busy`.
- `G12-OH-002`: post-loop pruning was awaited but wrapped in `Effect.ignore`,
  so its promised non-fatal failure logging did not exist.

The superseding candidate moves the Turn-specific idle publication out of the
inner runner. Only after the guarded admission and work owner have fully
unwound does the exact terminal owner enter a process-local `releasing` phase
and publish idle. During that publication, a distinct direct `startTurn(B)` may
replace A's exact terminal owner synchronously. A's conditional finalizer does
not remove B, exact `awaitTurn(A)` can still join A's handoff while A remains
the owner, and no queue, automatic retry, steer, or retarget is introduced.
Admission failures and terminal replays that never installed a runner do not
mint a new idle event.

Post-loop pruning now catches its cause and emits
`session pruning skipped` with the exact Session and error, while preserving
the Turn's already-derived outcome. The red-first idle-listener oracle failed
with `AlreadyRunning` on the reviewed candidate and now proves a real completed
A followed by a directly admitted, independently completed B. The red-first
prune oracle proved that the old path emitted no warning and now checks both
the unchanged terminal outcome and the structured warning.

Fresh affected-file evidence is:

```text
bun test test/session/session.test.ts
32 pass, 0 fail, 222 assertions

bun test test/session/prompt.test.ts
14 pass, 0 fail, 111 assertions
```

`G12-OH-001` and `G12-OH-002` are repaired in the working tree but remain
open until the original reviewer closes the superseding exact diff. No
integration authority is claimed.

Against base/HEAD `0d7ca3987ea69445d23f30ee8386706c0bbc86c9`, the
superseding seven tracked Session-lifecycle paths have a 62,324-byte raw binary
Git diff with SHA-256
`d2ae8bdefe146c6f9bd8240ee5cf122bc4125ad9bf843bfc1ce3b1cf541c4f7f`.
Their 610-byte ordinal content manifest has SHA-256
`86cf94a98840e1b4a7460d00ac538ad01762787ca0e7388090601aea4d0c8789`.
The manifest uses JavaScript default/ordinal ordering and one UTF-8/LF line per
path:
`<40-hex git hash-object --no-filters output><two spaces><path>`, with one
final LF. The rejected reviewed binding
`19f5e2925475e810a41fd0745289cd1e5811542825a7f9c5df5bdf91f0deed07`
remains provenance only. Staged path count is zero and no commit was created.

### Residual idle-publication closure repair

The original reviewer returned first closure `Revise`. `G12-OH-002` closed,
but `G12-OH-001` remained open as `G12-OH-001-R1`: A entered process-local
`releasing` before calling the unguarded Session-status writer. A distinct B
could replace A, run, and publish `busy` in that pre-publication window; A's
later unconditional `idle` then deleted or overwrote B's observable status.
The conditional owner-map finalizer did not protect status/event order, and
the idle-listener oracle exercised only the later reentrant window after A had
already entered its `Status(idle)` listener.

The superseding implementation gives Session-status writes a monotonically
ordered per-Session revision. An older status write stops after any nested
newer write instead of publishing a later idle event or mutating the current
map. Terminal owner A uses a guarded idle operation that rechecks, before and
after every yielding publication boundary and at the final deletion, that A
is still the exact owner. A distinct `startTurn(B)` may replace A during
release; the exact B owner therefore invalidates A's pending idle. In contrast,
`assertNotBusy` and shell admission continue to report busy while any Turn
owner remains. This preserves the required direct next-Turn behavior without
adding a queue, retry, steer, or retarget path.

The new deterministic oracle replaces Session status with a controlled
implementation, pauses A before idle publication, admits B exactly once,
enters B work and publishes `busy`, then resumes A. It proves A publishes no
stale idle and deletes no B status, B remains the exact durable active Turn,
ordinary busy checks still reject competing work, and A/B each execute once.
B's own completion then publishes the only final idle. The earlier reentrant
idle-listener oracle remains and proves a distinct B can also start directly
from the observed idle boundary.

Fresh affected evidence is:

```text
bun test test/session/session.test.ts
33 pass, 0 fail, 234 assertions

bun test test/session/prompt.test.ts
14 pass, 0 fail, 111 assertions

bun test test/session/processor-effect.test.ts
30 pass, 0 fail, 158 assertions

bun run typecheck
candidate-path diagnostics: none
excluded unchanged diagnostics: specs/fixtures/tui-plugins/tui-smoke.tsx
```

At this intermediate candidate point, `G12-OH-002` remained closed and
`G12-OH-001-R1` was repaired but still awaited original-reviewer closure. The
final closure below supersedes that disposition.

Against base/HEAD `0d7ca3987ea69445d23f30ee8386706c0bbc86c9`, the eight
tracked Session-lifecycle paths have a 72,811-byte raw binary Git diff with
SHA-256
`2825cc15c73260ac46dd43fe0721a97e9312e469ea7d2dc3cedd130dc3e51247`.
Their 692-byte ordinal content manifest has SHA-256
`97f8ae086c64ed859232c13f5cd0f9289a47123d4934ee326da47ae3a6936db2`.
The manifest uses JavaScript default/ordinal ordering and one UTF-8/LF line per
path:
`<40-hex git hash-object --no-filters output><two spaces><path>`, with one
final LF. The rejected `d2ae8bde...` / `86cf94a9...` closure candidate and
the earlier `19f5e292...` / `09a950ed...` binding remain provenance only.
Staged path count is zero and no commit was created.

### Final owner-handoff closure

Original reviewer task `019fad21-8a6a-7450-af90-505c0bce53f8`
independently reproduced the superseding candidate and returned exact-diff
`Accept`. `G12-OH-001-R1` is closed: exact-owner-guarded `setIdleIf` plus
per-Session status revisions prevent A's older idle publication from
overwriting or deleting B's newer busy state, while only a distinct
`startTurn(B)` may replace a releasing owner. The real idle-listener oracle and
the paused-pre-publication B-busy oracle cover both replacement windows without
queue, retry, steer, or retarget. `G12-OH-002` remains closed because prune
failure is caught, logged with Session/cause context, and cannot change the
already-derived Turn outcome.

The accepted implementation binding remains the eight tracked paths above:
72,811 raw binary Git-diff bytes with SHA-256
`2825cc15c73260ac46dd43fe0721a97e9312e469ea7d2dc3cedd130dc3e51247`;
the 692-byte ordinal content manifest has SHA-256
`97f8ae086c64ed859232c13f5cd0f9289a47123d4934ee326da47ae3a6936db2`.
The reviewer reproduced the two focused idle-race cases / 17 assertions and
the prune case / 5 assertions; executor-bound Session 33 / 234, Prompt 14 /
111, and Processor 30 / 158 remain the accepted affected evidence. Scoped
Gate 12 integration authority is available for this correction only. Gate 8
semantic changes, Gate 14 content, and Gate 16/17 authority remain outside this
closure.

The exact accepted eight-path correction is locally integrated at
`29f5a140ffd9595a5de60d5bee517bba1b029cf2`. The commit contains no Gate 8,
Gate 14, OAuth, or future-Gate path; those retain their separate owners and
dispositions.
