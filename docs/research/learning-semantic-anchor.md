# Learning-semantic anchor findings

Date: 2026-07-10

Status: Executable foundation finding. The lab validates contract separation;
its state names and deterministic policy are not accepted production design.

## Question

Can one thin runtime path make learning first-class before a full curriculum or
learner model exists?

The required path is:

```text
committed learning occurrence
-> rebuildable learner projection
-> context with provenance
-> Tutor action
```

It must also reject the inverse path:

```text
assistant says something plausible
or a learning tool merely attempts a write
-> learner state changes anyway
```

## Executable fixture

The isolated lab is under
[`labs/learning-semantic-anchor/`](../../labs/learning-semantic-anchor/README.md).
Production code cannot import it, and the README records its deletion
condition.

The fixture uses an in-memory SQLite database with three conceptual record
types:

```text
Session facts
  assistant text and failed tool attempts used as explicit non-evidence

Learning occurrences
  append-mostly accepted observations with conditions and a unique runtime
  operation identity

Learner projection
  rebuildable current interpretation with source occurrence IDs and revision
```

The deterministic action selector has only three lab-local outputs: probe,
advance, and repair. It exists to make data-flow consequences executable. It is
not an educational policy proposal.

## Trace exercised

### No committed evidence

An assistant message asserts that the learner has mastered the target. A failed
learning-tool call is also recorded in Session history.

Result:

```text
projection revision remains 0
learner state remains needs_probe
source occurrence list remains empty
next action remains probe
```

### Stronger committed evidence

An independent delayed success commits under a stable runtime operation ID.

Result:

```text
projection cites the committed occurrence
context carries the projection revision and source ID
the lab oracle chooses advance
```

### Conflicting committed evidence

In a separate database with the same goal and target, two independent failures
point to the same related prerequisite.

Result:

```text
projection cites both failures
context carries the related repair target
the lab oracle chooses repair instead of advance
```

### Weaker performance

A success without independence or delay is committed, followed by fluent
assistant praise.

Result:

```text
the occurrence is preserved
the projection does not promote it to the stronger lab state
assistant wording has no effect
the next action remains probe
```

### Retry and rebuild

An exact retry of one runtime operation returns the existing occurrence and
does not advance the projection revision. Reusing the operation ID with a
different outcome is rejected. Deleting the current projection and rebuilding
from committed occurrences reconstructs the same context.

## Verification

The focused command passed:

```text
bun test labs/learning-semantic-anchor/anchor.test.ts

5 pass
0 fail
15 expect() calls
```

Repository type checking also includes `labs/**/*.ts`, preventing the fixture
from silently rotting while it remains useful.

## What the lab establishes

1. Session history and learning-domain truth can be represented separately in
   one small runtime path.
2. A model assertion and a failed tool call are insufficient to revise learner
   state.
3. Accepted learning occurrences can be idempotent under a runtime operation
   identity.
4. A current learner projection can be treated as rebuildable rather than as
   the sole historical authority.
5. Context can carry the revision and source IDs behind its learner-state
   summary.
6. Materially different committed evidence can produce a materially different
   next action under the same goal.
7. Learning semantics can constrain the harness without placing learning types
   inside provider streaming or TUI rendering code.

These are foundation properties. They satisfy validation levels 0 and part of
level 3 for a deterministic fixture; they do not demonstrate predictive
validity or learning effect.

## What the lab does not establish

It does not establish:

- that `target` is the correct production domain abstraction;
- that the lab's three projection states form a sufficient learner model;
- that two failures should always trigger prerequisite repair;
- that delayed success should always cause advancement;
- that an LLM will select coherent actions from the same context;
- that the chosen action improves immediate or delayed human learning;
- that one occurrence row is sufficient for complex activities or artifacts;
- that an in-memory transaction exercises process-crash recovery;
- a production SQLite schema, tool name, package boundary, or public API.

Those non-claims are why the code remains in `labs/`.

## Consequences for production contract proposals

The foundation synthesis should preserve these semantic roles without copying
the lab's accidental structure:

```text
Session fact
  durable interaction history, not automatically learning evidence

Learning occurrence
  accepted, provenance-bearing fact committed by a domain transaction

Learner projection
  versioned, rebuildable inference citing source records

Context snapshot
  records which projection/source revision informed a model attempt

Tutor action
  chosen from goal + current compiled learning context
```

The production tool lifecycle must link its runtime invocation identity to the
domain occurrence or effect receipt. The Session recovery design must reconcile
that receipt before replay. Permission controls whether the operation may run;
domain validation controls what the committed occurrence means.

No `Topic.mastery` field, general event-sourcing framework, Markdown authority,
or mandatory StateDiff confirmation is required to preserve the demonstrated
invariants.

## Next foundation step

The source slices and semantic anchor now provide enough evidence to write one
reviewable foundation proposal for:

- `Message` and `MessagePart`;
- `ModelEvent`;
- tool definition, invocation, and settlement;
- permission request and decision;
- process-local Session execution;
- SQLite ownership and recovery boundaries;
- the transaction links among Session, learning occurrence, projection, and
  context provenance.

That proposal should name legal transitions and failure behavior before any
production runtime implementation begins.
