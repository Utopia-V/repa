# First production state and context spine

Date: 2026-07-11

Status: Completed ALS-018 implementation record. A 2026-07-12 phase review
provisionally recommends reclassifying the result as a semantic oracle and
substrate candidate rather than a completed production spine. This record
superseded the sequencing in roadmaps 01 through 03; their experiments and
negative results remain evidence.

## Subsequent phase-boundary review

The implementation passed the exit cases below, but the later substrate audit
found that the label "production spine" overstates what was established.

The learning-specific behavior remains an executable oracle: source-grounded
timed steering, withdrawal, semantic replay, correction, expiry, and automatic
context contribution. The surrounding Session, Turn, model-operation,
tool-invocation, recovery, exhaustion, and global-revision records are a
candidate host implementation, not an accepted application foundation.

Concretely, the schema permits assistant and tool Session items while the
production API only admits user items, and the generic successful-tool case has
no production settlement API. The learning executor is also directly joined to
the candidate host tables. These are useful discriminators for the next
runtime-seam lab, not evidence that a complete agent harness exists.

While the review remains the current working proposal, no generic host feature
should extend this shape until the runtime comparison decides which lifecycle
belongs to Repa and which belongs to a reusable runtime. This does not block an
independent route-domain pressure test or promotion of a route model that does
not depend on these host tables. The full review is
[`../research/broad-route-and-runtime-substrate-review-2026-07-12.md`](../research/broad-route-and-runtime-substrate-review-2026-07-12.md).

## Parent outcome

Begin formal project code with a state path that is already specific to the
long-running Tutor:

```text
admitted learner input
-> immutable model context cut
-> model-initiated local policy write
-> atomic effect and tool settlement
-> later Session context receives the still-live instruction
-> expiry or correction changes later context without rewriting history
```

This path is not intended to be a miniature finished product. It establishes
the identities and feedback boundary that every later course, progress,
revisit, assignment, and planning feature would otherwise have to guess again.

## Why this path is earned

- ADRs 0005 through 0008 already settle durable Turn identity, local
  transaction atomicity, finite runtime ownership, and real model write
  initiative.
- B1/B2 demonstrated persistence, context assembly, correction, and complete
  learning traces without earning their lab schema as production architecture.
- ALS-017 demonstrated a real model write loop and then failed at continuation
  policy.
- A deterministic probe showed that call-ID idempotency permits duplicate
  semantic facts after compaction or resampling.
- Retained scoped steering has an observed future consumer and does not require
  choosing a course ontology, mastery model, scheduler, provider, or TUI.

## Semantic checksum

**Product-loop purpose:** preserve learner steering across the learning loop so
the next Tutor move reflects still-live intent.

**Owned invariants:** durable input identity; physical invocation identity;
command-specific semantic effect identity; source-linked, time-bounded policy
state; immutable context-cut provenance.

**Representative behavior:** the learner says `今天先别测我`; a later Session on
the same day receives that active steering automatically.

**Counterexample:** compaction repeats the same input under a new tool call and
creates a second directive or state revision.

**Failure and correction:** stale new effects fail; identical effects replay;
conflicting interpretations require correction; expiry is a query-time change;
withdrawal preserves the original source.

## Implementation boundary

The first production code owns only:

1. SQLite opening and versioned first migration;
2. Session, admitted input, Turn, logical model operation, and physical tool
   invocation identities needed by this trace;
3. one retained time-bounded learner-steering effect and its explicit
   withdrawal;
4. separation of physical invocation settlement from semantic effect
   admission; and
5. compilation of a structured Tutor context cut plus a model-facing policy
   fragment, atomically admitted with its model operation.

The implementation uses a recorded model operation. It does not yet choose a
provider or implement streaming/rendering. Production code must not import a
lab.

## Required executable cases

1. An admitted learner input creates at most one Turn even if the same input ID
   is replayed; the same text under a new input ID remains a new occurrence.
2. A first tool invocation commits retained steering, advances state once, and
   settles atomically.
3. A different physical invocation from the same model-visible cause and
   identical semantic payload settles as already applied without advancing
   state.
4. The same semantic address with different applicability conflicts instead of
   silently replacing the first interpretation.
5. An unrelated state change can make the retry's expected revision stale;
   semantic replay still succeeds, while a genuinely new stale effect fails.
6. A new Session context before expiry includes the active steering and source
   provenance.
7. The same context after expiry omits it without any write or revision change.
8. A source-linked withdrawal changes future context while preserving the
   original contribution.
9. A transaction failure cannot leave the semantic effect without its tool
   settlement or vice versa.
10. The context cut exposes the Session cut, state revision, policy-profile
    revision, and sampling time used for one model operation.
11. A cut previewed before a pure-time expiry cannot be submitted after expiry;
    the formal entry recompiles and admits one cut atomically.
12. New state effects and Turn lifecycle events cannot be backdated behind the
    latest state or Turn event; failed attempts roll back without partial
    terminal state.
13. Explicit startup recovery fails orphaned work, while opening another
    SQLite connection does not pretend that the prior owner died.
14. Separate model-operation and tool-invocation limits terminate the Turn as
    `exhausted`, preserve a replayable receipt, and never insert the rejected
    attempt as work that started.

## Explicit non-goals

- no general command bus, event store, CQRS projection fleet, or workflow
  engine;
- no taxonomy of all learner directives or Tutor actions;
- no progress/course/revisit schema copied from B1;
- no natural-language date parser;
- no claim that prompt injection perfectly enforces learner steering;
- no provider retry implementation or production TUI; and
- no compatibility layer for unreleased schemas.

## Exit and next decision

The phase exits only after focused tests, the full repository check, and a
semantic-drift review against the product loop and accepted ADRs.

Exit evidence on 2026-07-11:

- focused production spine: 14 tests, 111 assertions, all passing;
- full `bun run check`: reference verification, both TypeScript projects, and
  96 tests with 698 assertions, all passing;
- independent reviewers found no remaining P0/P1 after the final chronology,
  atomic-sampling, and exhaustion-receipt corrections; and
- the phase-boundary audit found no production import from `labs/`, no generic
  manager/service layer, and no promotion of steering into preference,
  evidence, mastery, or an all-action ontology.

The 2026-07-12 review proposes two independent next experiments: distill one
complete runtime trace from the pinned references and realize it through mature
libraries; and pressure-test the course/material route representation
separately. OpenCode modification is a fallback only if the distilled trace
identifies a missing boundary that would otherwise force Repa to rebuild
generic runtime machinery. A route domain model may be promoted on its own
evidence if it does not depend on the candidate host tables. Neither path is
another command-by-command extension of the present idempotency machinery.
