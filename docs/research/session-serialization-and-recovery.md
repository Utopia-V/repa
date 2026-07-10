# Session serialization and recovery findings

Date: 2026-07-10

Status: Research synthesis and candidate execution contract. No production
`AgentRun` or persistence schema is accepted by this document.

OpenCode reference commit:
`b1fc8113948b518835c2a39ece49553cffe9b30c` (`v1.17.18`)

## Question

How should one local Session accept input, serialize agent execution, handle
mid-run steering and interruption, and recover after process loss without
duplicating model turns or learning-domain effects?

Interruption itself is not a special educational problem. It is the same
control-flow problem faced by a coding agent. The learning-specific consequence
is that recovery must not contradict already committed learning facts.

## Sources traced

The main sources for this slice are:

- [`packages/core/src/session/run-coordinator.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/session/run-coordinator.ts)
- [`packages/core/src/session/execution/local.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/session/execution/local.ts)
- [`packages/core/src/session/runner/index.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/session/runner/index.ts)
- [`packages/core/src/session/runner/llm.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/session/runner/llm.ts)
- [`packages/core/src/session/input.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/session/input.ts)
- [`packages/core/src/session/projector.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/session/projector.ts)
- [`packages/core/src/session/store.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/session/store.ts)
- [`packages/core/src/session/history.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/session/history.ts)
- [`packages/core/src/event.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/src/event.ts)
- [`packages/opencode/src/session/run-state.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/opencode/src/session/run-state.ts)
- [`packages/core/test/session-run-coordinator.test.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/test/session-run-coordinator.test.ts)
- [`packages/core/test/session-prompt.test.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/test/session-prompt.test.ts)
- steering, queueing, interruption, and recovery cases in
  [`packages/core/test/session-runner.test.ts`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/packages/core/test/session-runner.test.ts)
- [`specs/v2/session.md`](https://github.com/anomalyco/opencode/blob/b1fc8113948b518835c2a39ece49553cffe9b30c/specs/v2/session.md)

OpenCode's V2 specification explicitly says that post-crash continuation
recovery is deferred. The implemented local coordinator is therefore useful
evidence for serialization and input durability, not proof of a complete
recovery protocol.

## One active drain per Session

The reusable OpenCode invariant is:

```text
one active execution owner per Session in one process
different Sessions may execute concurrently
```

Its coordinator has three commands with intentionally different meanings.

### Resume

`resume(session)` starts a drain while idle or joins the existing drain. Two
concurrent callers do not create two provider requests. Cancelling a joined
waiter does not cancel the execution owner.

### Wake

`wake(session)` reports that durable work may now exist. While a drain is
active, repeated wakes coalesce into at most one follow-up drain. A wake is not
the work itself, and losing an in-memory wake must not lose the input.

### Interrupt

`interrupt(session)` stops the active owner, clears already-pending wakes, and
waits for cleanup. A new wake or resume arriving during cleanup becomes a
successor only after the old owner has released the Session.

This avoids the most dangerous race:

```text
old owner is still settling tools
new owner starts assembling the next model request
```

Repa can implement this with a small process-local map and an abort signal. It
does not need a general job manager, distributed lease, or durable runner
object for a single-process local application.

## `AgentRun` is initially an execution, not a durable aggregate

The word “run” should describe one process-owned drain of eligible Session work.
The durable objects are the input, Session messages/parts, model attempts, tool
invocations, and their settlements.

Persisting a `busy` row or an enclosing run ID would not make process ownership
survive a crash. It would instead leave stale ownership that a later process
must distrust.

The initial candidate is therefore:

```text
Session
  durable interaction identity and ordered history

AgentRun
  process-local serialized drain for one Session

ModelAttempt
  durable boundary around one dispatched provider request and its output

ToolInvocation
  durable boundary around one proposed and executed tool call
```

A durable run aggregate should be added only if a later requirement needs one
identity across multiple attempts, processes, or machines and cannot derive it
from the Session chronology.

## Input admission and model visibility are different facts

OpenCode V2 persists a prompt in a Session inbox before waking execution. It
later promotes that input into visible user history at a provider-turn
boundary.

This distinction solves several real races.

### Admission

Admission means:

```text
the application accepted this exact user input
the input survives process loss
the caller may safely retry with the same ID
the input is not necessarily in a dispatched model request yet
```

An exact retry with the same client-supplied message ID returns the prior
record. Reusing the ID with different text or delivery semantics is a conflict,
not a second message and not a silent overwrite.

### Promotion

Promotion means:

```text
this admitted input became part of ordered Session history
this input is eligible for context assembly at the next model boundary
```

OpenCode projects the visible user message and marks the inbox row promoted in
one durable transaction. Concurrent promotion attempts produce one visible
message.

Repa needs the admission/visibility distinction even if it does not initially
support OpenCode's separate `steer` and `queue` delivery modes. One default
delivery policy is enough:

- input received while idle starts or wakes the Session;
- input received while active is admitted durably and joins at the next safe
  model boundary;
- an explicit user interrupt stops current work before the admitted input is
  handled;
- a deferred queue mode is added only when a real learning workflow needs it.

## A provider attempt uses a captured input cutoff

A request already sent to a provider cannot be mutated by later input. At the
start of an attempt, the runner captures the current durable Session sequence
and promotes only inputs eligible through that boundary. Inputs admitted later
remain pending for the next attempt.

This provides deterministic chronology:

```text
capture Session boundary N
-> promote eligible input through N
-> assemble context
-> dispatch provider request
-> later input is admitted after N
-> later input appears only in the next request
```

Multiple later inputs can be promoted together at that next boundary. Repeated
wake notifications need not produce repeated provider calls if the durable work
query is already empty.

## Durable records, projections, and notifications

OpenCode V2 commits a durable event, its sequence, and its current projection
inside one SQLite transaction. Notifications occur after the commit and are
advisory. A listener defect cannot roll back or strand already committed input.

Repa does not need to adopt that full event system. It should preserve these
properties with simpler tables:

1. Each Session has a monotonic durable sequence independent of wall-clock
   timestamps and caller-generated IDs.
2. Input admission is atomic and idempotent by input ID.
3. Making an input model-visible and appending its user message are atomic.
4. Closing an assistant part and updating the current Session projection are
   atomic.
5. Recording a tool invocation precedes side effects; settling it is atomic.
6. UI notifications happen after commit and may be dropped or coalesced.
7. Startup and reconnect query durable state rather than trusting missed
   notifications.

This is compatible with the earlier storage recommendation:

```text
SQLite current tables
+ append-mostly audit/occurrence rows
+ rebuildable projections
```

It does not require treating every product object as an event-sourced
aggregate.

## Learning context also needs a captured boundary

Session chronology alone is insufficient for a learning-native agent. Each
model attempt also needs to know which learning-domain state was compiled into
its context.

At attempt start, context assembly should capture at least:

```text
learner projection revision or build identity
source occurrence/evidence IDs used by that projection
active goal and obligation revisions
course-map/source revisions relevant to the action
context policy and prompt version
```

The exact compiled prompt may be provider-specific and rebuildable. The
provenance boundary is durable so later inspection can answer “what did the
Tutor know when it chose this action?”

If a learning tool commits new evidence during an attempt, it cannot retroactively
change the request already dispatched. The next model attempt rebuilds context
from the new domain revision. This is how learning state becomes part of the
normal continuation loop rather than an occasional note written after chat.

## Failure and cleanup behavior

### Joined caller cancellation

The caller waiting for an active run may stop waiting without cancelling the
owner. Only the explicit Session interrupt command owns cancellation.

### Provider failure

The current attempt is closed as failed, partial content is retained, and
started tools are settled or reconciled. Input admitted while the attempt was
running remains durable. A wake received during failure cleanup may schedule
one successor after the failed owner exits.

### UI or subscriber failure

The committed Session record remains valid. The UI can rebuild from the latest
durable sequence.

### Projection failure before commit

The SQLite transaction rolls back. An admitted but unpromoted input remains
pending and can be promoted by a later wake or explicit resume.

### Process loss

Process-local ownership disappears. Recovery derives a classification from
durable input, attempt, content, tool, and domain-operation records. A persisted
`busy` flag is never accepted as proof that another owner still exists.

## Recovery classification

Recovery should classify durable state before deciding whether continuation is
safe.

### Admitted input not yet visible

Safe work exists. It may be promoted on explicit resume or by a startup policy
that clearly tells the user it is resuming accepted input.

### Visible input with no dispatched attempt

Safe to start a new model attempt.

### Provider dispatch with no terminal attempt record

The provider outcome is ambiguous. Repa-owned mutable tools are still safe from
invisible execution because local tools begin only after their calls are
received and durably recorded. The provider request itself may have consumed
tokens or produced unobserved text.

The first runtime should close the attempt as interrupted and require an
explicit continuation rather than silently redispatching it. Provider-hosted
mutation is forbidden, as established in the tool-lifecycle slice.

### Partial assistant content without a complete provider attempt

Close the accumulated content as interrupted. It remains visible history but
does not become learning evidence. A later explicit continuation sees the
partial response and may repair or restart the pedagogical action.

### Recorded invocation not yet executing

No effect has begun. The runtime may explicitly execute it if the original
definition identity is still valid, or reject it as stale/cancelled.

### Executing invocation without terminal settlement

Never replay blindly. Reconcile by runtime invocation identity and effect
receipt. A transactional learning operation can settle from its committed
receipt; an external operation without reliable evidence becomes
indeterminate.

### Settled tool with no following provider attempt

The tool result is durable. It is safe to assemble the next context and start a
new provider attempt; the tool itself must not execute again.

### Terminal assistant attempt with no pending input or continuation

The Session is idle. No startup work is inferred.

## Candidate process-local coordinator contract

The smallest complete interface needs behavior equivalent to:

```text
activeSessions()
resume(sessionID)    start while idle, otherwise join
wake(sessionID)      coalesce advisory work notification
interrupt(sessionID) cancel owner and await cleanup
```

Its legal process states are:

```text
idle
active
stopping
```

One coalesced successor may be registered while active or stopping. State
returns to idle only after cleanup and after no successor remains.

The coordinator does not decide what work exists. A Session drain queries
durable state at each boundary. This keeps work truth out of an in-memory map.

## Candidate Session drain

A drain is a loop over durable work, not an unbounded autonomous agent:

1. Recover or classify nonterminal prior attempts and tools.
2. Promote eligible admitted input at an atomic boundary.
3. Stop if no input or continuation is eligible and no explicit forced attempt
   was requested.
4. Capture Session sequence and learning-context provenance.
5. Record the model attempt before or atomically with provider dispatch intent.
6. Consume `ModelEvent`s into durable Session content and tool invocations.
7. Await or reconcile every runtime-owned invocation from that attempt.
8. Close the model attempt.
9. Re-query durable Session and learning state.
10. Continue only for a settled tool result, newly admitted steering, or another
    explicit policy reason.

The stop/continue decision comes from durable state and policy. A provider
`finish` event is not sufficient by itself.

## Thin learning-semantic trace

### Normal continuation

1. The cooperative learner enters `开始学习`.
2. Input admission commits before the runtime is woken.
3. The per-Session coordinator starts one drain and atomically makes the input
   visible.
4. Context assembly captures learner projection revision `L` and the domain
   records supporting it.
5. A model attempt selects a learning activity and emits a runtime-owned tool
   call.
6. The learning tool commits an occurrence and effect receipt, producing
   learner revision `L+1`.
7. The tool and model attempt settle durably.
8. The same Session drain re-queries domain state rather than reusing the old
   prompt context.
9. The next model attempt captures `L+1` and chooses the next action using the
   newly committed occurrence.

### Mid-run learner steering

1. While an explanation is streaming, the learner enters `换个方式，先问我`.
2. The input is admitted durably but cannot mutate the dispatched provider
   request.
3. If the learner interrupts, the current attempt closes partial content and
   settles or reconciles active tools.
4. Cleanup releases ownership; one successor run promotes the new input.
5. The next attempt sees both the accepted learning history and the learner's
   steering.

### Required counterexamples

- Two simultaneous `resume` calls dispatch only one provider request.
- Three wakes for one admitted input do not create three attempts.
- A lost wake does not lose the input; an explicit resume still finds it.
- Retrying the same input ID with different content is rejected as a conflict.
- Cancelling a joined UI waiter does not abort the Session owner.
- A stale durable `busy` value after process loss does not prevent recovery.
- Evidence committed during a provider attempt does not rewrite the context of
  that already-dispatched request.
- A crash with an executing learning tool reconciles its receipt before any
  continuation or replay.
- An interrupted assistant assertion does not become learning evidence merely
  because it appears in visible Session history.

## Deliberate differences from OpenCode

Repa should preserve the serialization and durability invariants without
copying:

- a general durable event bus and projector framework before there are multiple
  real consumers;
- worker, HTTP, generated SDK, remote placement, or aggregate ownership layers;
- separate queue delivery before a learning workflow requires it;
- product-scale compaction, shell, subagent, and background-job coordination;
- process-local `busy` state as durable truth;
- automatic failure of an old running learning tool without domain receipt
  reconciliation;
- an enclosing durable run identity without a recovery consumer;
- automatic redispatch of ambiguous provider work after process loss.

## Accepted findings versus open design

This slice establishes these invariants for later production contracts:

1. One process owns at most one active drain per Session.
2. Concurrent resumes join; wakes coalesce; explicit interrupt owns
   cancellation and waits for cleanup.
3. Durable input precedes wake, and input admission is distinct from model
   visibility.
4. Wake notifications are advisory; durable state is the source of work.
5. Session order uses a monotonic durable sequence.
6. Each provider attempt captures one Session/input boundary and one
   learning-context provenance boundary.
7. Startup classifies nonterminal work before continuation; it never trusts a
   stale busy flag or blindly replays a side effect.
8. A transactional learning tool reconciles through its runtime invocation
   receipt.

Still open:

- exact `Session`, `ModelAttempt`, and input table shapes;
- whether explicit resume may redispatch an interrupted text-only attempt or
  always starts a visible continuation instead;
- which pending inputs, if any, auto-resume on application startup;
- whether a second deferred delivery mode is needed;
- how much compiled context is stored versus rebuilt from provenance;
- limits for admitted input backlog, repeated continuation, and tool calls;
- backup and migration of Session chronology alongside learning-domain state.
