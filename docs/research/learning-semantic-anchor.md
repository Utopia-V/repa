# Learning-significance contract findings

Date: 2026-07-10

Status: Executable foundation finding. The lab validates authority,
transaction, and correction boundaries. Its local signals and deterministic
selector are not accepted production policy.

Current scope note (2026-07-11): the lab proves only its declared local
transaction and correction behaviors. It does not establish a general evidence
form, learner projection, selector advantage, or first product path.

## Question

Can one thin SQLite-backed path make learning first-class without treating all
educational conversation as evidence or designing a complete learner ontology?

The required positive path is:

~~~text
formal task context
-> source-linked result under observable conditions
-> correctable evidence interpretation
-> rebuildable learner projection
-> candidate reason
-> materially different next action
~~~

The required negative paths are:

~~~text
ordinary clarification -> Session history only
completed explanation whose declared activity contract requires verification
-> verification obligation, not mastery evidence
time passes -> review pressure may become due, no evidence is invented
~~~

## Executable fixture

The isolated lab is under
[labs/learning-semantic-anchor/](../../labs/learning-semantic-anchor/README.md).
Production code cannot import it, and the README records its deletion
condition.

The fixture uses one in-memory SQLite database with five semantic roles:

~~~text
Session items
  authoritative user/assistant text

Formal task context and task result
  educational purpose, target, alignment source, answer source, and conditions

Evidence interpretation and correction
  fallible educational meaning that can be retracted without deleting source

Learner projection and obligations
  rebuildable local signal plus verification/review work

Tool invocation
  execution identity and terminal settlement
~~~

The lab keeps these roles queryable even though they share one database. It
does not claim that each role requires a production table.

## Behavioral traces

### Ordinary clarification

A user asks what a term means. The Session item is stored.

Result:

~~~text
zero task results
zero evidence interpretations
projection remains unresolved
the lab selector requests a formal task
~~~

### Selected explanation

An assistant explanation is intentionally selected as a teaching activity, and
its declared completion contract requires later verification.

Result:

~~~text
zero evidence interpretations
one verification obligation
projection remains unresolved
the lab selector chooses verification
~~~

The explanation is not silently interpreted as mastery.

### Formal result under known conditions

A reviewed formal task is aligned to one target. A source Session item carries
the learner answer. The same task is completed independently in one database
and missed in another.

Result:

~~~text
independent success -> locally positive signal -> ready-work candidate
miss                -> needs-review signal    -> assessment-review candidate
~~~

This is a wiring oracle. It does not establish that one success proves mastery
or that one miss should interrupt the current activity.

### Assisted performance

A successful result records that a hint was used.

Result:

~~~text
source result remains successful
evidence interpretation remains assistance-aware
projection requests verification rather than treating it as independent recall
~~~

### Passage of time

A scheduled review obligation has a future due time. Context is assembled once
before and once after that time.

Result:

~~~text
the later context includes naturally due review
the evidence-interpretation count does not change
~~~

### Atomic local learning command

The tool invocation is recorded before executor entry. The lab injects a
failure after result, interpretation, obligation, and projection work but
before tool settlement.

Result:

~~~text
the SQLite transaction rolls back all learning changes
the previously recorded invocation remains recorded
a later exact retry can commit the result and settlement together
~~~

This supports a narrow local transaction instead of a general effect-receipt
protocol for the first learning write.

### Retry, correction, and rebuild

An exact operation retry returns the existing commit. Reusing the operation
identity with different input is rejected.

Retracting an interpretation:

~~~text
keeps the original task result
marks the interpretation inactive
cancels obligations derived from it
rebuilds the projection without it
changes the next action accordingly
~~~

Deleting and rebuilding the projection from active interpretations reproduces
the same learning context.

## Verification

The focused command passes:

~~~text
bun test labs/learning-semantic-anchor/anchor.test.ts

9 pass
0 fail
40 expect() calls
~~~

Repository type checking includes labs/**/*.ts, preventing the fixture from
silently rotting while it remains useful.

## What the lab establishes

1. Session history and learning-domain meaning can remain separate in one
   SQLite-backed path.
2. Educational purpose and source provenance can gate promotion from
   interaction history into learning-significant state.
3. Selected teaching can declare future verification without creating mastery
   evidence; the explanation label alone does not require that consequence.
4. A local learning result and its tool settlement can commit atomically.
5. Runtime invocation identity can deduplicate a command without becoming the
   semantic identity of the result.
6. Evidence interpretation can be corrected without deleting source history.
7. Current learner projection can remain rebuildable.
8. Time-derived review pressure need not create evidence.
9. Materially different admitted evidence can produce a materially different
   next action under a deterministic oracle.

These are boundary properties, not evidence that the chosen action improves
human learning.

## What the lab does not establish

It does not establish:

- a production Session, Turn, tool, task, evidence, or projection schema;
- that target is the correct general domain abstraction;
- that the fixture's local signals form a learner model;
- that a single success or miss warrants the fixture's selected action;
- how an LLM-authored task alignment becomes trusted;
- how open-ended programs, proofs, or essays are evaluated;
- a retention model, FSRS parameters, or candidate-ranking policy;
- process-crash recovery beyond SQLite transaction rollback;
- external-effect idempotency or reconciliation; or
- improved immediate or delayed learning outcomes.

## Consequences for the foundation proposals

The revised runtime proposal should preserve:

~~~text
durable Turn history
separate logical model and tool lifecycles
formal task purpose and source-linked result
fallible evidence interpretation with correction
rebuildable learner projection and obligations
compact context provenance
atomic local learning write plus tool settlement
~~~

It should not copy the lab's table names, selector priorities, local signals, or
test data into production.

The behavior is now represented in:

- [Foundation runtime contracts](../proposals/0001-foundation-runtime-contracts.md)
- [Learning-task significance and scheduling](../proposals/0002-learning-task-significance-and-scheduling.md)

Both remain proposals until their concrete defaults are promoted through
maintainer-reviewed ADRs.
