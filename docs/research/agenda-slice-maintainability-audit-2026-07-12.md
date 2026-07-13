# Agenda slice and ALS-021 preflight maintainability audit

Status: one correctness blocker fixed; remaining findings routed
Date: 2026-07-12

## Scope

This audit followed the first production Agenda future-attention slice and
preceded live ALS-021 shared-policy trials. It reviewed Interaction chronology,
Tutor context compilation, runtime tool binding, Agenda inspection types,
tests, and decision-document coverage. It is a maintenance record, not a new
product roadmap.

## Correctness blocker closed

The old code had no single authority for the latest durable event in a
Session. `admitUserTurn` checked only Session creation, context compilation
looked only at Session items, and the runtime floored time only inside the
current Turn. Two real counterexamples followed:

```text
assistant @ 100, prior Turn finished @ 101
-> new user @ 50 was admitted
-> context compilation later failed
```

and, more seriously:

```text
prior Turn failed @ 100 with no assistant item
-> new user @ 50 was admitted
-> model context @ 51 was also accepted
```

Interaction now owns `readLatestSessionEventAt`, covering Session creation,
Turn start/finish/exhaustion, Session items, model sampling/completion, and tool
invocation/settlement. New input admission, generic atomic model-operation
admission, Tutor context compilation, and runtime cross-Turn clock flooring use
that authority. Turn event reads also include terminal and exhaustion time.

Session sequence still owns total interaction order. Timestamps provide a
nondecreasing causal lower bound; equal times are legal, exact replay retains
its old time, and different Sessions remain independent.

Regression coverage includes visible and terminal-only history, rejection
without a stranded Turn, equal timestamps, Session independence, exact old
input replay after later events, legacy malformed data, runtime wall-clock
regression, and terminal/exhausted Turn reads.

## Important findings deliberately not mixed into ALS-021

These are real maintenance issues but do not invalidate the policy experiment's
small independent databases or its first-move traces.

1. **Provider call identity names are inaccurate.** Some public runtime
   parameters say `toolCallId` where the value is already the
   model-operation-scoped durable invocation ID. Rename raw and durable values
   at their existing boundary; do not add an identity framework.
2. **A binding-owned failure is replayed through domain failure casts.**
   `context_refresh_required` belongs to the shared tool binding, but terminal
   replay may currently ask Course or Agenda executors to cast it as their own
   failure union. Binding should replay failures it created before entering a
   domain executor. Add an exact physical replay test for a blocked second
   mutation.
3. **Terminal Agenda inspection exposes open-only eligibility language.** An
   addressed concern can be returned as `eligibility: eligible`. Restrict
   eligibility to open concerns and eventually make the four legal transition
   shapes a discriminated union; do not build a general state-machine layer.
4. **Shared runtime ordering was documented too locally.** Per-Turn FIFO and
   one-mutation-per-context apply to every local tool, not only Agenda. ADR-0007
   now records the shared invariant; Roadmap 07 remains the application record.

Resolve items 1-3 before extending their affected public contracts or relying
on their misleading types in another production consumer. They are not a
license to delay the bounded ALS-021 model-policy experiment.

## Deferred with explicit triggers

### Session-frontier navigation indexes

The correct full-Session frontier query currently lacks ordinary child-side
indexes on:

```sql
turn(session_id)
session_item(session_id)
model_operation(turn_id)
tool_invocation(model_operation_id)
```

SQLite does not create these from foreign keys. A synthetic audit with 20,000
Turns across 100 Sessions measured roughly 34.7 ms per context cut without the
indexes and 1.0 ms with them. ALS-021 uses tiny isolated databases, so changing
the schema before the experiment would add no evidential value.

Add and remeasure the four navigation indexes when any of these occurs:

- context compilation p95 exceeds about 5 ms;
- one LearnerHome reaches thousands of Turns and continues growing;
- history import or long-running dogfood begins; or
- the project is about to claim long-lived multi-Session runtime capacity.

Do not jump directly to a materialized `session.last_event_at`. That projection
would enlarge every model, tool, item, settlement, exhaustion, and recovery
write path.

### Other bounded cleanup

- The tool-execution coordinator's real lifetime is one Turn and its `claim`
  is a model-context mutation slot. If another tool-catalog construction site
  appears, move coordinator creation to the Turn owner and rename it before the
  implicit lifetime can reset.
- Agenda text bounds are duplicated across Zod and domain validation, with
  UTF-16 versus Unicode-code-point behavior for emoji. Consolidate only when a
  second active consumer needs the same bound.
- Agenda has strict explicit-offset civil-time parsing while timed learner
  steering still uses `Date.parse`. Reuse one domain-independent parser before
  accepting broader steering time input.
- The Agenda source-read description says “exact learner source” even though
  the actual guarantee is an exact bounded window around the verified excerpt.
  Correct the wording when that tool surface is next edited.

## Verification evidence

At the audit boundary:

```text
bun test test/first-production-state-spine.test.ts test/tutor-runner.test.ts
23 pass, 0 fail, 154 assertions

bun test labs/shared-tutor-policy-pressure
11 pass, 0 fail, 83 assertions

bun run typecheck
passed
```

Full repository verification remains required after ALS-021 artifacts and
navigation updates are complete.
