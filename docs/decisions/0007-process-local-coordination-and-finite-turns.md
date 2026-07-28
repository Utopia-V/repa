# ADR-0007: Keep first-slice coordination process-local and bound every Turn

Status: Accepted
Date: 2026-07-11

## Context

Mature terminal agents use live queues, cancellation tokens, active-run owners,
and finite step or rollout guards. Persisting every coordination detail before
a restart consumer exists would add a workflow engine without improving the
first learning path. Leaving continuation unbounded would instead allow a
model/tool loop to run indefinitely or hide exhaustion as a normal completion.

## Decision

The first implementation keeps these values process-local:

- mid-Turn steering that has not yet entered durable Session history;
- pending permission channels and session-only grants;
- cancellation tokens and active-owner locks;
- stream deltas, partial tool input, and provider retry state.

After restart, a durable running Turn with no live owner becomes interrupted.
Pending process-local approval and unpromoted steering are cancelled and are
not executed or reconstructed. Previously completed durable items remain.

“Steering” in this ADR means an explicit new learner input targeted at the
exact running Turn. Before promotion it is process-local; after promotion it is
a durable Turn input. An ordinary editable draft queued for the next root Turn
has not been admitted at all. Neither mechanism is ADR-0010 retained learning
policy or a durable macro-activity owner.

Before every additional logical model operation or tool invocation, the owner
checks finite code-enforced limits. The first slice records separate configured
limits for model operations and tool invocations. Reaching a limit produces the
explicit terminal Turn outcome `exhausted`; it is not reported as success.

All current local tools in one Turn execute through one process-local FIFO
lane. Provider tool calls may be emitted together, but durable invocation and
receipt events settle in causal order. Because every current local tool records
durable interaction state, reads use the same lane as learning mutations; this
decision does not introduce a general task scheduler or forbid a future
evidence-backed read/write distinction.

One immutable model context may initiate at most one durable learning-state
mutation. A second mutation request from that same context is durably rejected
with `context_refresh_required`; a new model sample can observe the first
change and decide again. The lane and mutation slot are owned by the live Turn
runtime and are not recovered as pending coordination after restart.

The limit transition atomically retains a terminal receipt containing the
counter kind, observed count, configured limit, triggering attempt identity,
canonical request envelope, and transition time. The attempt did not start, so
it is not fabricated as a model operation or tool invocation. An exact retry,
including after reopen, returns the same exhaustion outcome; reusing the
attempt ID with a different envelope conflicts. Generic Turn settlement cannot
mint `exhausted` without this receipt.

Exact conservative numbers may change without revising this ADR. Removing the
finite guard or changing its ownership requires a new decision.

## Consequences

- The first slice guarantees correct durable history and local learning facts,
  not restoration of in-flight work.
- The terminal must not claim that uncommitted steering survives a crash.
- A future durable inbox or resumable approval flow requires a real consumer,
  an ordering contract, and its own recovery design.
- Limits remain domain-independent safety mechanics; learning policy may stop
  earlier but cannot bypass them.
- A lost exhaustion response is recoverable without redispatching work or
  guessing which counter ended the Turn.
- Model-emitted parallel calls cannot race two state transitions from one stale
  context, and a read result cannot be treated as visible to a mutation sampled
  before that read completed.

## Counterexample

A learner steers an active explanation while the input remains only in the
live Turn queue, then the process exits. Recovery marks the Turn interrupted
and does not pretend the steering was accepted. Automatically redispatching the
old Turn could repeat tools under stale learning context.
