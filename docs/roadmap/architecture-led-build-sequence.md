# Product pressure paths and engineering gates

Date: 2026-07-12

Status: Active build map under ADR-0012. It replaces the earlier numbered
`Phase 1 -> Phase 5` sequence, which incorrectly made domain-entity order look
like product order. The completed course-continuity milestone remains valid.
The automatic “activity/progress Phase 2” does not.

## Goal

Grow the working Tutor into a Learning System that can make difficult material
tractable, support durable and transferable learning, and handle real work and
constraints without rebuilding the product around one database table, one
teaching method, or the Agent loop.

This is not a minimum-MVP sequence. The stable architecture boundaries are
already accepted. Feature-specific types continue to be earned by behavior,
but the behavior is now chosen from the learner outcome rather than from the
next empty module in the ownership map.

## Why the numbered phase chain was withdrawn

The earlier sequence placed simple activity records before Agenda, and Agenda
before evidence and adaptive review. That order was defensible as database
construction, but it produced a misleading “next step”: record that a range was
explained.

An explained-range fact can prevent needless reintroduction. It cannot decide
why material is difficult, choose a useful explanation, adapt to the learner's
response, or decide what kind of later return would help. Making it the next
product phase would optimize continuity bookkeeping while deferring the core
Tutor behavior.

The replacement uses two axes:

```text
learner-visible product pressure path
                 x
authority / context / command / correction / failure gate
                 =
one coherent build decision
```

In plain language: first decide which useful learning behavior must work. Then
make it cross the architecture safely.

## Product direction

The product has several peer capability families. They are not runtime modes,
stored learning stages, or a fixed implementation order.

### Make difficult material tractable

The Tutor can orient, explain, demonstrate, change representation, choose or
generate examples, guide an attempt, let the learner explore, and adapt when
the first move does not help.

### Make learning durable and usable

The Tutor can return to older material through recall, explanation,
comparison, application, reconstruction, or real work. Timing and form follow
the intended learning outcome and available evidence; review is not synonymous
with cards or one scheduler.

### Connect learning to real work and constraints

Assignments, examinations, projects, deadlines, and time budgets alter the
near-term plan without silently rewriting course structure or learner ability.
The learner can ask for direct completion help even when a more effortful
learning move would otherwise be useful.

### Sustain a long-running learning life

Courses, materials, goals, Sessions, revisits, evidence, and artifacts remain
connected across time. The system can continue after a new Session or changed
material without requiring the learner to synchronize it manually.

These headings communicate product outcomes. Do not create corresponding
`Tractability`, `Retention`, `Transfer`, or `LearningStage` entities.

## Completed foundation and continuity

The repository has executable evidence for:

- one finite TypeScript/Bun Tutor loop over AI SDK provider and tool mechanics;
- durable Session, Turn, model-operation, tool-invocation, and terminal
  outcomes;
- one immutable context cut per model sample;
- model-initiated, source-bound, correctable local learning commands;
- single-writer LearnerHome ownership and transactional SQLite migrations;
- source-grounded Markdown and no-material provisional course genesis through
  one Course View authority;
- revision-bound Material Map reads and stale realignment;
- correctable route continuity distinct from mastery;
- real fresh-Session continuation without transcript or full-material replay;
- one source-linked, correctable Agenda future-attention concern that can cross
  a fresh Session without carrying old source text; and
- one policy-versioned, source-bound learner-response-before-disclosure
  constraint that becomes a conditional purpose only for exactly one legal
  current candidate; and
- one per-Turn FIFO tool lane plus one durable learning-state mutation per
  immutable model context.

The completed milestone and evidence remain:

- [`06-real-course-material-continuity.md`](./06-real-course-material-continuity.md)
- [`07-first-agenda-future-attention.md`](./07-first-agenda-future-attention.md)
- [`../research/phase-1-course-continuity-verification-2026-07-12.md`](../research/phase-1-course-continuity-verification-2026-07-12.md)

This work established the floor: Repa can know where the learner is and read
the right material. It did not establish that Repa can reliably unlock a hard
idea or make it last.

## Current product pressure path: teach, adapt, and return

### Parent outcome

Across real material and more than one Session, the Tutor helps with one
currently difficult part, changes its approach when the learner's response
calls for it, and later returns in a form that serves the original learning
purpose. The learner does not maintain the state manually, and the system does
not treat exposure as mastery.

This is a set of behavior traces over one Agent loop, not a mandatory lesson
pipeline.

### Why this is next

Course/material continuity now supplies the broad route, exact source, and
cross-Session context boundary needed by teaching. The highest-value unresolved
product question is no longer whether the system can store another kind of
progress. It is which durable consequences, if any, are required for later
teaching and review to improve.

This path deliberately crosses parts of learner history, Agenda/revisit, and
possibly evidence ownership. It must not prebuild all three modules. It earns
only the meanings used by the representative behaviors.

### Required contrasting traces

At least these cases must use the same runtime and shared Tutor policy:

1. **Procedure acquisition:** a novice needs orientation and a worked example
   before unsupported problem solving is useful.
2. **Concept or representation repair:** the learner can follow steps but asks
   why they work; the Tutor changes representation or connects principle and
   procedure instead of repeating the introduction.
3. **Discrimination or strategy choice:** the learner knows multiple methods
   but confuses when they apply; contrasting or mixed cases are useful for a
   reason, not randomly.
4. **Delayed return:** older material is relevant again; the Tutor chooses
   recall, relearning, explanation, comparison, or application according to the
   target and history rather than defaulting to rereading.
5. **Direct real work:** the learner explicitly prioritizes completing an
   assignment; the Tutor may help directly and preserve only a worthwhile
   deferral or future concern.

The source synthesis and full counterexamples are recorded in
[`../research/teaching-and-review-first-principles-2026-07-12.md`](../research/teaching-and-review-first-principles-2026-07-12.md).

### Architectural questions this path pressures

- Which later Tutor action actually needs more than route position and raw
  Session history?
- When does a reason to return become a durable Agenda revisit, and when is it
  merely one-Turn judgment?
- What target and purpose must a revisit retain so a later activity can
  satisfy it honestly?
- Which recent interaction summary belongs in current-move detail, and which
  raw explanation remains lazy?
- Which review eligibility and time consequences are deterministic, and which
  choice of form remains model judgment?
- When does a learner response become evidence consumed by a future action,
  rather than ordinary Session history?
- Can the Tutor adapt without persisting a difficulty classification or
  encoding a lesson state machine?

The deterministic proof below resolves these at the ownership and meaning
level: same-Turn adaptation has a zero-write path; a durable return belongs to
Agenda only when a future concern must cross the Session boundary; serving it
requires an aligned later occurrence; and learner evidence remains separate.
The implemented first production contract fixes only the concrete values
consumed by its trace.

### Earned and implemented first meaning boundary

The deterministic trace and collision proof now establishes that the first
durable cross-Session consumer is a specific revisit, not a generic activity
row. Agenda owns a correctable, source-linked future-attention concern with:

- enough target and bounded reason to distinguish why the Tutor should return;
- the actual source basis and semantic authorship of the concern;
- an activation meaning and lifecycle sufficient for the first consumer; and
- correction, inspection, and explicit relation to any later occurrence that
  serves or dismisses it.

This does not authorize a universal `FutureAction`, `LearningObject`, or
`DifficultyKind`. It also does not put later activity conditions or learner
evidence inside Agenda. Roadmap 07 has fixed the exact fields, transitions,
source/target rules, compact query, lazy read, and correction path for this one
consumer. Richer timing forms, target unions, multiple-concern semantics, and
alignment automation remain deferred until another behavior requires them.

The B1 lab already demonstrated schedule/due/resolve/reopen/reschedule mechanics
and B2 already consumed a due revisit in a model Turn. Reuse those behaviors as
oracles. Do not port the lab table. The new pressure is purpose and alignment:
why the system should return, which form serves that reason, and what later
activity may truthfully satisfy it.

An explanation remains model-led interaction and raw Session history by
default. A review remains a Tutor move. An actual independent response or
artifact may become learner evidence only when a later decision consumes its
conditions and outcome.

The proof, five controlled traces, false-completion cases, and freeze/defer
boundary are recorded in
[`../research/teach-adapt-return-architecture-proof-2026-07-12.md`](../research/teach-adapt-return-architecture-proof-2026-07-12.md).

### First production slice result

The first production table and commands were admitted only after these gates:

1. Freeze the contrasting traces and one counterexample for each proposed
   durable meaning.
2. For every proposed field, name the later query or transition that consumes
   it and delete fields with no consumer.
3. Specify ownership, legal transitions, persistence, correction, retry,
   stale-input, interruption, and restart behavior for the first revisit or
   evidence command.
4. State what remains in the raw Session and how it is retrieved lazily.
5. Use a model-behavior pressure run only for claims about policy/context use;
   do not let a simulated learner or LLM judge stand in for human learning.

Roadmap 07 now implements the concrete first-command contract: causal/effect
identity, entity/source preconditions, create/address/dismiss/supersede/reopen
transitions, atomic settlement, bounded inspection and lazy source retrieval,
fresh-Session context, correction, retry, interruption, restart, and negative
zero-write behavior. This closes the deterministic architecture slice only.

ALS-021 has now tested the remaining shared-policy gate over 112 samples. The
policy did not earn v1 acceptance. Current learner history often changed the
move, but an eligible Agenda reason did not reliably preserve its purpose: all
eight independent-prediction returns disclosed the answer before the intended
unaided opportunity. Do not respond by expanding Agenda storage or adding
scenario-specific prompt rules.

ALS-022A has now isolated realization from selection. With the same production
trace and model, an oracle-selected purpose produced 7/8 purpose-valid
predictions and withheld the answer in 8/8, compared with 0/8 under candidate
exposure alone. An inspectable selected current-purpose projection is therefore
the demonstrated control seam when durable state governs a move. It remains
bounded composition state, not an Agenda disposition or durable activity.

ALS-022B/C have now rejected two universal selector shapes. The first passed
12/22 and allowed an Agenda ID to acquire the opposite current-request meaning;
the second preserved exact sources but passed only 10/18, ignoring Agenda in
every generic-continuation sample. Do not add a mandatory selector step or
rescue it with another prompt enum.

ALS-022D then removed the selector. Composition bound the sole legal Agenda
concern as a conditional default inside the normal realizing sample, while the
exact current request retained higher priority. Generic continuation,
direct-help, explicit comparison form, completed occurrence, and redirection
passed 10/10 with truthful Agenda state. This is the current one-candidate
control direction; it adds no durable activity and no model round trip.

ALS-022E has now settled one part of that contract. Removing the explicit
learner-role restatement reduced strict independent-prediction validity to 3/8;
exact reason plus default status is insufficient. The first contract therefore
needs exact source identity/version/target/reason, conditional priority, Turn
scope, and one source-bound `learner response before Tutor disclosure`
constraint, plus override and failure behavior. Proposal 0005 now implements
that bounded first-production contract under `tutor-default-v3`, including
conservative migration, correction, exact full-count admission, continuation,
and counterexample gates. Do not generalize it into a constraint
registry or pedagogy enum. Several materially different candidates remain
unresolved, and internal Agenda/control vocabulary must not leak into
learner-facing prose. ALS-022A/D/E observed that current pre-tool/control text
can enter the final assistant output. The architecture gate found no reason to
replace the current modular monolith. A pinned Codex/AI SDK comparison then
narrowed the presentation issue and removed it as a predecessor. Proposal 0005
has implemented the learning-owned constraint, conditional contribution, and
natural rendering; one bounded live provider check also passed. Response-item
phases are deferred until repeated material leakage, partial recovery, or a
real TUI consumer earns them. This is not permission for keywords, a
response-approval tool, another model, or a second runtime.

### Withdrawn candidate: last-minute deadline conflict

The post-0005 phase review compared three peer gaps instead of extending the
newest Agenda mechanism by default:

- a narrow learner-performance occurrence that might change a later action;
- real assignments, deadlines, current time budgets, and direct-help steering;
  and
- richer Course/ontology graph representation.

Course is already graph-shaped enough for current consumers; another relation
must wait for a real branch, prerequisite, rejoin, or lineage query. Generic
learner-evidence experiments remain negative, and same-Turn adaptation already
has a zero-write path. A performance occurrence remains important, but it must
first prove a cross-Session consumer rather than reopen a universal evidence
schema.

The selected pressure was wrong. B2 demonstrated only that a scene-specific
prompt could execute one last-minute 45/25/30-minute script. That rescue case is
outside Repa's product scope and cannot define any Learning-System behavior.
Proposal 0006 then excluded learning
context/nature, workload, progress, capacity, and cross-day allocation—the
quantities needed for ordinary advance planning.

Schema 6 and explicit `tutor-default-v4` remain implemented behind a dormant
policy revision, and their deterministic tests remain useful historical
evidence. They are not an admitted Assignment boundary. ALS-023 cannot establish
a new near-deadline consideration problem because its product oracle was
invalid. The CLI correctly stays on `tutor-default-v3`.

Strict timestamp parsing, source provenance, revisions, correction, replay, and
transaction behavior may be reused only when a corrected consumer justifies
them. The completed aggregate is not itself that justification.

- Contract: [`../proposals/0006-deadline-sensitive-real-work-contract.md`](../proposals/0006-deadline-sensitive-real-work-contract.md)
- Implementation plan: [`08-first-deadline-sensitive-assignment.md`](./08-first-deadline-sensitive-assignment.md)
- Verification and failed live gate: [`../research/proposal-0006-production-verification-2026-07-13.md`](../research/proposal-0006-production-verification-2026-07-13.md)
- Governing correction: [`../research/semantic-drift-audit-2026-07-13.md`](../research/semantic-drift-audit-2026-07-13.md)

### Immediate coherence repair before another product slice

The semantic audit found current-v3 contradictions that precede new Assignment
or ontology code:

1. bound the default Session history supplied to each model sample and record
   omissions, so persistent state does not depend on an ever-growing transcript;
2. separate internal/control model phases from learner-visible output rather
   than relying on prompt non-disclosure;
3. expose listing/selecting an existing Course; and
4. expose withdrawal of retained timed learner steering.

The first two protect core architecture claims and must be designed before
another live product-policy experiment. Course switching is also a prerequisite
for representative multi-course planning cases. These are scoped corrections,
not permission to build a memory framework, response approval system, or global
command registry.

### Exit evidence

The pressure path has not exited. It exits only when:

- the same shared policy produces materially different appropriate Tutor moves
  in the contrasting situations without hard-coded scenario actions;
- at least one first explanation is changed after the learner's response rather
  than merely repeated;
- a future return, when useful, survives a fresh Session with source and
  purpose intact and retrieves cold detail lazily;
- an unrelated explanation creates no forced revisit, test, evidence record,
  or difficulty label;
- direct real-work steering is respected;
- correcting or cancelling the durable consequence changes later context while
  preserving source history;
- retry, stale input, interruption, crash, and reopen remain truthful;
- repository architecture checks remain green; and
- any claim about improved retention, transfer, or human understanding is
  explicitly left unverified until real learner evidence exists.

## Later capability horizons

These are peer horizons selected after returning to the whole product. Their
order is not fixed by this document.

### Long-horizon goals, assignments, deadlines, and multi-concern Agenda

There is no admitted first Assignment conflict. Start from representative
substantial work: multiple learning contexts, estimated remaining workload,
available capacity over days, learner corrections, progress feedback, missed
allocations, and replanning. The program owns feasibility arithmetic and
reproducible allocation from accepted inputs. The model may help identify,
estimate, semantically decompose, teach through, or explain the work and may
propose meaning-sensitive alternatives. Compare classical rolling-horizon and
workload-leveling ideas without turning one score or scheduler into the Tutor.

This horizon also pressures long-term course progress, changed goals, detours,
and intended rejoin. Add only the Agenda and planning lifecycles required by
observable consumers.

### Attempts, artifacts, evidence, and adaptive later action

Represent task purpose, response or artifact source, relevant assistance, and
observed outcome when two later Tutor actions genuinely differ. Preserve
observation, interpretation, inference, and resulting plan as separate meanings
where behavior needs the distinction.

### Review scheduling and compression

Use simple due windows and model choice while the domain is sparse. Consider
FSRS-like scheduling only for repeatable recall/fluency units with adequate
logs. Consider implicit review credit only when a task's alignment shows that
the older target was actually exercised. No scheduler becomes the product
center.

### Multiple courses and reusable domain foundations

Add cross-course choice and versioned Domain Foundations when real courses
reuse concepts, capabilities, task families, or high-value relations. A course
continues to work without a populated foundation.

### Terminal product surface

Build a richer TUI when the daily learning behavior has state worth inspecting
and correcting. The TUI projects runtime and domain state; it never owns
learning truth or execution.

### Retrieval and external integrations

Measure structural and full-text retrieval before embeddings. Calendar, notes,
Anki, LMS, and other connectors remain outer capabilities with their own
permission, idempotency, and reconciliation boundaries.

## Engineering gates for every pressure path

Before and after each coherent extension:

1. Re-read product origin, Tutor behavior, ADR-0012, and the complete learning
   traces.
2. Name the learner-visible outcome and the product-loop step under pressure.
3. Name every authority that owns a durable meaning; keep interaction, source,
   course, learner, Agenda, and policy meanings separate.
4. Demonstrate representative behaviors and prohibited counterexamples.
5. Keep routine context bounded, current-move detail selected, and cold detail
   lazy.
6. Make source, revision, correction, retry, interruption, restart, and
   conflicting-writer behavior explicit.
7. Verify that learning-domain code has no inward dependency on AI SDK,
   provider, or terminal packages.
8. Delete experiments, duplicate concepts, compatibility structure, and fields
   with no accepted consumer.
9. Run:

```powershell
bun run check:reference
bun run typecheck
bun run test
bun run check
```

Passing one local test never authorizes another round of optimization on the
newest module. Return to the product direction and choose again.

## Rollback and drift rules

- If a product outcome heading appears as a runtime entity, remove it.
- If a transient difficulty interpretation appears as a durable learner label,
  remove it unless a reviewed consumer proves otherwise.
- If review scheduling starts defining teaching, course structure, or learner
  ability, narrow it to its actual timing consumer.
- If a generic `manager`, `planner`, `FutureAction`, workflow, event, or graph
  abstraction starts owning several unrelated meanings, restore the separate
  authorities.
- If a prompt becomes the only enforcement of identity, legality, permission,
  state transition, or correction, move that boundary back into code.
- If a classic CS mechanism or mature library already owns generic scheduling,
  locking, indexing, streaming, or rendering, reuse it after confirming the
  same problem exists here.
- If a real learner or source contradicts the working teaching hypothesis,
  preserve the evidence and revise the local behavior; do not defend the
  roadmap vocabulary.
