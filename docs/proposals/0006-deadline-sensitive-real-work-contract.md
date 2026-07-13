# Proposal 0006: Deadline-sensitive real-work contract

Date: 2026-07-13

Status: **Withdrawn as a product contract and current pressure path.** The
deterministic v4 candidate remains dormant and unaccepted. The representative
45/25/30-minute emergency fixture was outside Repa's product scope and excluded
the workload, capacity, learning-context, and cross-day allocation meanings
required by the intended Assignment behavior. This document is retained only
as a historical engineering artifact. See the
[`semantic drift audit`](../research/semantic-drift-audit-2026-07-13.md) and the
[`implementation and qualification record`](../research/proposal-0006-production-verification-2026-07-13.md).

Nothing below is a current product requirement or implementation plan. Narrow
mechanisms such as strict time parsing, provenance, and revision history must
be justified independently before reuse.

## Plain-language summary

Repa should remember that a real assignment exists and when it is due, so a
later Session can take it into account without asking the learner to restate
it. If the learner has 45 minutes and a 25-minute report is due in 30 minutes,
the Tutor may protect the submission first, return to a due learning concern
with the remaining time, and postpone new material.

That does **not** mean the program owns the institution's truth, that the
assignment always outranks learning, or that Repa needs a todo planner. Repa
owns a correctable local representation of the report it received. The current
learner request still governs the Turn; the model makes the local trade-off;
and the resulting one-off plan normally remains ordinary Session history.

## Historical rationale for the pressure path

This behavior connects two peer parts of the product that production has not
yet forced to coexist:

- real work, deadlines, and limited time; and
- course teaching, due future attention, and direct learner steering.

It is not selected because `assignment` is the next missing table. It is
selected because the existing Tutor is currently blind to a real constraint
that should materially change its action. The older B2 Trace 5 already showed
that a source-linked deadline, a reported duration, and a current 45-minute
budget can change one model-led plan without a scheduler score or learner
profile. Another pre-implementation model experiment would repeat that result.

B2 is only a behavior oracle. Its lab attached a general-education report to
the active JavaScript course. Production must not preserve that accident.

The independent path review is recorded in
[`../research/chatgpt-pro-next-pressure-path-review-2026-07-13.md`](../research/chatgpt-pro-next-pressure-path-review-2026-07-13.md).

## Semantic checksum

Product-loop purpose:
  let a real, time-bounded obligation alter current help and near-term learning
  without erasing the longer learning situation

Owned durable meaning:
  Agenda owns Repa's source-grounded, correctable representation of one
  reported assignment and its local disposition

Representative behavior:
  an open assignment recorded in an earlier Session becomes relevant near its
  deadline; the learner supplies a current time budget; the Tutor reads cold
  source detail and makes a reasonable temporary trade-off that protects the
  real obligation without losing the due learning concern

Counterexample:
  the learner explicitly asks for direct help, corrects the deadline, reports
  completion, cancels the work, or chooses a different immediate priority; the
  system follows that current meaning instead of enforcing an old plan

Non-effects:
  recording, starting, completing, or passing the deadline creates no mastery,
  learner evidence, Course progress, automatic Agenda service, or durable plan

## Representative trace

### Earlier Session

The learner reports one real assignment:

- a general-education report is due tomorrow at 20:00 in the learner's current
  time zone;
- about 25 minutes of work remain; and
- the learner describes its learning value as low.

Repa records one source-linked assignment. The structured local record keeps
the identity, title, interpreted deadline, current disposition, version, and
source reference. The reported duration and value judgment remain in the cold
source detail because the first routine query does not need to turn either
into a score.

### Later fresh Session

At a trusted current time 30 minutes before the deadline:

- the assignment remains open;
- one Course View item is current;
- one learning concern is already due;
- new material is available but untouched; and
- the learner says they have 45 minutes and asks to continue.

The routine context shows the compact assignment and learning state. The Tutor
reads the assignment source before relying on the reported duration or value
judgment. A valid response may choose:

1. use the first 25 minutes to complete or submit the report;
2. use the remaining 20 minutes for the due learning concern; and
3. leave the new material for later.

The exact schedule is model judgment, not a deterministic EDF/least-slack
policy. A different current request, a high-learning-value assignment, or
uncertain source detail can produce a different move.

### Time crossing

If the assignment remains open at the exact deadline, the next query reports
it as `overdue`. No background job, stored `overdue` transition, notification,
or new observation is created. It remains visible until explicitly completed,
cancelled, or corrected.

## Authority and epistemic boundaries

| Meaning | Owner | First-slice treatment |
| --- | --- | --- |
| learner's original report or correction | Interaction | immutable Session item; exact source remains lazy |
| institution/LMS deadline truth | external source, if any | not integrated or claimed by this slice |
| Repa's current interpreted assignment record | Agenda | durable, versioned, source-grounded, correctable |
| current clock | Tutor composition/runtime | trusted input used for query-time derivation |
| current 45-minute budget | current learner request | visible in the Turn; not persisted as assignment state |
| active course and route | Course View | unchanged by assignment priority |
| due learning concern | Agenda future attention | separate aggregate and lifecycle |
| current trade-off and wording | model-led Tutor behavior | flexible and inspectable in Session history |
| one-off schedule | Interaction/Session | not a durable plan object |
| assignment completion | Assignment disposition | source-bound local meaning only |
| learning demonstrated by the work | future learner/evidence authority | never inferred here |

Agenda owns the local assignment because it is a future real-work obligation,
not because every todo belongs in Repa. The first admission requires the source
itself to identify a coursework deliverable, examination deliverable, learning
project, or work serving an explicit current learning goal, together with a
deadline. An ordinary job project or personal deliverable with a deadline does
not enter this aggregate merely because the Tutor could help with it. Grocery
lists, arbitrary agent todos, and the Tutor's own execution plan are likewise
outside this boundary and remain ordinary Session content.

That classification is a source-grounded, model-authored interpretation under
ADR-0008, not a keyword rule the executor can prove from open language. The
program validates the current learner source, exact source occurrence, strict
time value, permission, identity, and state transition. It retains the
creation model operation and a bounded admission rationale so the learner can
inspect and correct a mistaken classification. A deterministic domain test can
prove there is no implicit text-triggered write; only a bounded provider
behavior check can test whether the ordinary Tutor avoids calling the command
for unrelated work.

The first slice is LearnerHome-scoped and carries no mandatory Course foreign
key. It also adds no optional `courseId`, `goalId`, or `artifactId` merely in
anticipation of future use. A later behavior may earn one of those typed
relations. Until then, title plus lazy source detail preserve the reported
context without falsely making the active course its owner.

## First assignment aggregate

The implementation shape is deliberately not frozen, but the first aggregate
must be able to explain these values:

- host-created assignment identity;
- current entity version;
- bounded title;
- normalized absolute deadline at minute precision;
- original offset-bearing tool value, interpretation IANA time zone, model
  operation, and admitted natural-language source;
- local disposition: `open`, `completed`, or `cancelled`;
- admitted source item and exact source span/excerpt for creation;
- source-bound revision or disposition occurrence; and
- immutable transition history sufficient for inspection and correction.

`overdue` is not a disposition:

```text
overdue := disposition == open && current_time >= deadline
```

There is no first-slice `in_progress`, `priority`, `urgency`, `slack`,
`learningValue`, `goalRelevance`, `percentComplete`, or recurring schedule.
Work-in-progress details remain in Session history until a later consumer needs
a durable meaning.

The deadline is Repa's current interpretation of the admitted report, not an
unqualified claim about an external institution. The interpretation operation,
time zone, source, and later corrections must remain inspectable.

The first slice admits only a deadline whose learner source is precise enough
to resolve a local civil date and minute. “Friday,” “later today,” or a date
without a required submission time remains raw source and triggers one clear
clarification before structured admission. This avoids inventing end-of-day
precision and avoids adding an uncertainty/interval model with no current
consumer.

## Semantic identity and source admission

Physical tool-call identity cannot define assignment identity. The model also
cannot invent a durable assignment ID.

For the first contract, one creation occurrence is addressed by:

- the admitted current learner item;
- one exact excerpt that uniquely identifies the reported assignment inside
  that item; and
- the assignment-create command kind.

The host resolves the verified excerpt to a stable source span and creates the
entity ID. This allows more than one assignment in one learner item without
hashing model prose or forcing an unrelated Course target. If an excerpt is
absent or ambiguous, the write fails without state change; a later model sample
may request a longer exact excerpt or clarification.

The creation excerpt must be a bounded contiguous source span that carries the
basis for both the distinct real-work obligation and its deadline. Other cold
details may live elsewhere in the same immutable source item and are retrieved
through bounded windows.

Exact replay of the same source occurrence and canonical assignment value
returns the existing effect and entity. Reusing that occurrence with a changed
title or deadline conflicts. A real later correction uses a new admitted
source and the assignment's expected entity version.

This replay rule does **not** identify the same assignment across genuinely new
learner Inputs. Before Create, the model must distinguish a source that
introduces a new local obligation from a later mention, correction, completion,
or cancellation of an existing one. It uses routine context or assignment
inspection first; if the existing and proposed entities cannot be reliably
distinguished, it reads or asks one clear question instead of creating.

Open language gives the executor no stable external Assignment ID with which to
hard-deduplicate two reports. The admission decision is therefore retained as
the model's inspectable semantic authorship, not disguised as deterministic
identity. If a duplicate or unrelated Assignment is later discovered, an
explicit source-bound cancellation stops local tracking and records the
correction basis without claiming that an external institution cancelled the
real work. Conversely, two genuinely different assignments may share the same
title and deadline; no title/deadline uniqueness rule is admitted.

Every later transition owns the same kind of command-specific address rather
than falling back to a new tool-call ID:

```text
admitted learner occurrence + verified exact source span
+ assignment ID + transition kind
```

Its canonical value includes the expected entity version, transition-specific
new value or disposition, and bounded source basis. Exact semantic replay is
looked up before current-state rejection. A new invocation with the same
address and value settles against the existing effect; the same address with a
different value conflicts. A genuinely new learner correction is a new causal
occurrence.

## Legal transitions

These names are local to Assignment; they do not create a global workflow.

### Create

Creates one `open` assignment from an admitted current learner source. The
executor binds source item, source span, operation, trusted current time, time
zone, and semantic effect identity. The model supplies a bounded title, exact
source excerpt, and an absolute deadline with explicit offset.

The learner does not need to speak ISO-8601. The model supplies an
offset-bearing minute-precision value; the executor validates it with a strict
civil-time parser before normalizing it to an instant. `Date.parse` alone is
insufficient because runtimes may normalize impossible dates. Seconds and
fractional seconds are rejected in this first contract. The offset must be
valid for the recorded interpretation IANA time zone at that instant; a
missing, impossible, or DST-ambiguous source time is clarified or rejected
rather than silently assigned a deadline.

Semantic equality uses the normalized instant for deadline behavior.
Equivalent offset spellings of the same instant are not different deadlines,
while the original offset-bearing tool value, operation, time zone, and learner
source remain provenance. A real learner correction creates a new revision
even when it happens to normalize to the same instant, because the corrected
source meaning is separately inspectable.

The first slice does not scrape an LMS or silently turn a Tutor suggestion into
an assignment.

### Revise

Changes the title or deadline from an exact current learner correction and
expected entity version while preserving the current disposition. It is legal
for both active and terminal assignments: correcting the historical deadline
of a completed assignment must not temporarily make it active. The old revision
and source remain inspectable. A deadline extension is a correction, not an
override record or a new assignment.

### Complete

Moves `open -> completed` only when an admitted current learner report says the
local obligation has been satisfied or otherwise needs no further action. If
submission is required, finishing a draft without submitting it does not
settle the assignment. The transition does not verify external delivery, prove
unaided work, address a learning concern, or create evidence.

Merely opening the file, receiving direct help, or reaching the deadline does
not complete it.

### Cancel

Moves `open -> cancelled` from exact current learner intent that the local
obligation should no longer be treated as active. It does not claim external
institutional cancellation unless a later external adapter supplies that
authority.

### Reopen

Moves `completed | cancelled -> open` from an admitted learner correction, for
example when a submission failed or a cancellation report was mistaken. The
terminal transition remains in history; the entity version advances. The same
atomic transition may carry a corrected title or precise deadline when one
learner source says both that the terminal disposition was wrong and that the
work details changed. A crash can therefore never leave `open` with a known
obsolete deadline between separate reopen and revise mutations.

Because terminal assignments leave routine active context, reopening requires
a bounded recent-terminal inspection completed before the mutation's model
context is sampled. The inspection grants the host-visible assignment identity
and version; it does not let a model guess an old ID. The same rule applies
when an active assignment was hidden by routine-context truncation.

## Current request and planning policy

An open or overdue assignment is a constraint visible to Tutor composition,
not an unconditional selected action.

- An exact current request for direct completion help is served directly to
  the requested degree; Repa does not force a quiz first.
- Still-applicable retained learner steering keeps its accepted precedence over
  Agenda constraints. For example, an active instruction not to plan today is
  not silently discarded merely because an assignment is open.
- A request to ignore, cancel, correct, or reprioritize the assignment governs
  the current Turn and invokes a durable transition only when it actually
  changes Assignment state.
- A short deadline can justify temporarily deferring teaching or review, but
  it does not change Course structure, learner ability, or the future-attention
  lifecycle.
- A high-learning-value task may be taught through while it is completed. The
  low-value compression in the representative trace is not a policy enum.
- Several materially different obligations with no accepted ordering rule are
  shown as bounded facts. The model may offer a reversible rough route or ask
  one clear question; the program does not silently manufacture a scalar
  ranking.

No durable record is required merely because the learner chose a different
one-Turn order. A future commitment or deferral earns its own Agenda meaning
only when it must survive a Session boundary.

## Context and lazy detail

Routine LearnerHome context may contain a bounded projection of active
assignments ordered deterministically by absolute deadline and ID:

- assignment ID and entity version;
- bounded title;
- deadline;
- derived `open` or `overdue` temporal state; and
- lazy source reference.

The query must also report the full active count so truncation cannot be
mistaken for uniqueness or absence. Deadline-first truncation is an explicit,
inspectable retrieval policy: it favors near deadlines for routine awareness,
but it does not decide the Tutor action. A read-only assignment inspection
capability must page through the active set without requiring a visible ID, so
an exact current request can recover an assignment hidden by the compact
window. It must also page a bounded recent `completed`/`cancelled` view for
learner inspection and reopen. A later relevance index or filter requires its
own evidence; the first slice does not silently rank by semantic similarity.

Assignment mutations may use an identity/version only when it was present in
the persisted context cut or exposed by a completed inspection before that
mutation's model sample. Two parallel calls from one sample cannot pretend the
second observed the first result.

Reported duration, value judgment, complete instructions, artifacts, old
corrections, and old Session text remain cold. An assignment-scoped read
capability can return a bounded source window and revision metadata. Every read
reports full source length, window coordinates, and truncation, and can request
a later bounded window under the same assignment capability. This lets duration
or value detail outside the creation span remain discoverable without loading
the whole item. Historical source text is labeled as a report, not executable
current learner steering.

The current time budget remains in the admitted current request for this
slice. Retaining a time budget across Sessions would require an explicit scope
and expiry consumer; it is not smuggled into Assignment or stable learner
preferences.

## Persistence, recovery, and failure

- Assignment payload and transition history live in Agenda-owned tables, not
  in `durable_effect` JSON.
- Domain transition, immutable effect receipt, global commit watermark, and
  tool settlement commit in one SQLite transaction.
- The global revision is only a causal/context watermark. Assignment entity
  version plus admitted source/capability are the stale-write preconditions; an
  unrelated Course or Agenda commit does not invalidate an otherwise current
  Assignment transition.
- Exact physical retry reuses the completed semantic effect; a changed retry
  conflicts.
- Create, revise, complete, cancel, and reopen each derive their semantic
  effect address from the admitted learner occurrence, verified source span,
  assignment domain address, and command-specific transition slot. Replay is
  checked before entity-state rejection.
- Stale entity version, invalid/ambiguous source excerpt, invalid civil time,
  impossible transition, and guessed assignment ID leave zero Assignment
  change.
- An unrelated Course View revision neither rewrites nor stales the assignment;
  this slice has no Course ownership relation.
- Time crossing performs no write. Reopen/restart recomputes temporal state
  from the stored deadline and trusted sampling time.
- Provider failure, interruption, or crash before settlement invents no
  assignment or disposition. Startup recovery never executes an orphan tool.
- Once the Assignment/effect/tool settlement transaction commits, a later
  provider error, interruption, or failed Turn does not roll it back. Reopen
  and exact replay preserve and return the committed receipt.
- One immutable model context retains the existing one-learning-mutation rule;
  subsequent writes require a fresh context cut.
- No background scheduler or daemon is introduced.

## Required counterexamples

Before production admission, verification must cover:

1. fresh-Session compact assignment context with cold detail absent;
2. lazy source read before using duration/value detail;
3. exact deadline boundary deriving `overdue` with no state revision;
4. deadline correction, completion, cancellation, and reopen with preserved
   source history;
5. exact retry, changed retry, stale version, malformed time, ambiguous source,
   interruption, restart, and transaction rollback;
6. impossible civil dates, DST ambiguity, equivalent-offset normalization, and
   an unrelated global revision not acting as a stale guard;
7. an unrelated active Course remaining unchanged and unowned by Assignment;
8. direct-help response with no forced quiz, Agenda service, evidence, or
   Course progress;
9. an ordinary teaching Turn creating no implicit assignment;
10. assignment completion creating no mastery or learner evidence;
11. a finished draft with required submission still pending not completing the
    assignment;
12. a terminal historical deadline revision preserving terminal disposition;
13. one atomic reopen plus deadline correction rolling back together on
    failure;
14. a later learner mention of an existing assignment taking the inspect/read/
    correction path rather than automatically creating a duplicate;
15. two distinct assignments with the same title and deadline remaining
    separately representable;
16. a one-off 45-minute plan creating no durable plan object;
17. an assignment named by the current request remaining inspectable when an
    earlier unrelated deadline pushed it out of routine context;
18. hidden/truncated active assignments not being treated as a unique winner;
19. several obligations producing no unearned scalar priority;
20. historical source text not becoming current executable steering; and
21. a bounded provider negative control in which ordinary non-learning work
    does not cause the model to create a learning Assignment.

Learner-visible acceptance additionally requires that:

- after create or revision, the Tutor can state naturally what Repa recorded
  and which interpreted absolute deadline it will use;
- “what assignments do you remember?” and “why do you think this is due then?”
  can inspect the compact record, revision, and original source without asking
  the learner for an internal ID; and
- ordinary-language correction reaches the legal revision/reopen path while
  preserving the old source and interpretation.

## Historical production admission and verification plan

No new architecture-changing model uncertainty remains before the first
implementation: B2 already demonstrated that the model can consume this kind
of constraint and make the representative trade-off. The next gate is a
semantic/code review of this contract.

If the contract survives review, the first production slice may implement:

- the Assignment aggregate and migration;
- create/read/revise/complete/cancel/reopen commands through the existing Tutor
  capability boundary;
- bounded context plus lazy source detail; and
- deterministic shared-runtime and fresh-Session tests.

Assignment contribution and tools remain LearnerHome-level. They must compile
outside the active-Course branch in the current Tutor context/tool binding, so
a learner can record or inspect real work before any Course exists. This needs
no second runner or manager; the existing migration registry, bound capability
executor, one-mutation coordinator, immutable context cut, effect receipt, and
tool settlement remain the generic substrate.

After deterministic verification, one bounded provider smoke may check the
representative conflict and one direct-help counterexample. It must not become
another broad simulated-student campaign or dual-model blind review. It checks
that the Tutor notices the real constraint, reads needed cold detail, preserves
the due learning concern, and respects current steering; it must not freeze
B2's exact minute-by-minute plan as the only acceptable answer.

The integration smoke creates the Assignment through the real model-facing
Earlier-Session command and consumes it in a fresh Later Session. Directly
seeding a domain row would not verify semantic admission, tool settlement, or
cross-Session composition.

## Explicitly deferred

- a production Goal aggregate;
- Course, goal, artifact, LMS, or calendar association;
- multiple external source reconciliation;
- durable time-budget or calendar availability;
- work-progress percentages or subtasks;
- assignment learning-value, urgency, or relevance scores;
- EDF, least-slack, CP-SAT, FSRS, or another scheduler as Tutor policy;
- persistent plans, reminders, notifications, recurrence, or a todo UI;
- automatic Agenda concern creation or service;
- learner-performance occurrence, evidence, mastery, or ability inference;
- automatic credit because an assignment happened to mention the same topic;
  and
- a universal `Commitment`, `WorkItem`, `FutureAction`, or workflow abstraction.

Each deferred item requires a distinct learner-visible consumer and its own
authority/correction boundary.

## Sources

- [`../foundation/00-product-origin.md`](../foundation/00-product-origin.md)
- [`../foundation/03-complete-learning-traces.md`](../foundation/03-complete-learning-traces.md)
- [`../architecture/00-system-architecture.md`](../architecture/00-system-architecture.md)
- [`../decisions/0003-learning-state-follows-evidence.md`](../decisions/0003-learning-state-follows-evidence.md)
- [`../decisions/0006-atomic-local-learning-transaction.md`](../decisions/0006-atomic-local-learning-transaction.md)
- [`../decisions/0008-model-write-initiative-and-durable-authority.md`](../decisions/0008-model-write-initiative-and-durable-authority.md)
- [`../decisions/0012-learning-centered-modular-monolith.md`](../decisions/0012-learning-centered-modular-monolith.md)
- [`../research/learning-native-b2-trace-5-2026-07-11.md`](../research/learning-native-b2-trace-5-2026-07-11.md)
- [`../research/teaching-and-review-first-principles-2026-07-12.md`](../research/teaching-and-review-first-principles-2026-07-12.md)
- [`../roadmap/architecture-led-build-sequence.md`](../roadmap/architecture-led-build-sequence.md)
