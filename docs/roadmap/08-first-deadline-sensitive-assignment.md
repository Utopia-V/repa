# Withdrawn deadline-sensitive Assignment production slice

Status: **Historical implementation plan; not an active roadmap item.** Its
last-minute conflict was outside Repa's product scope, and it explicitly
deferred the state needed for cross-day
workload planning. The unaccepted v4 runtime, prompt, tools, and dedicated
tests have since been deleted; schema 6 remains only as an inert compatibility
tombstone. See
[`../research/semantic-drift-audit-2026-07-13.md`](../research/semantic-drift-audit-2026-07-13.md).

Date: 2026-07-13

Historical result: the deterministic v4 candidate was implemented and checked;
live provider qualification failed, the CLI remained on v3, and the candidate
was later deleted. That result does not reverse the withdrawal above. See
[`../research/proposal-0006-production-verification-2026-07-13.md`](../research/proposal-0006-production-verification-2026-07-13.md).

## Historical goal

Carry one source-grounded, correctable real assignment from an earlier Session
into the ordinary Tutor loop so a trusted deadline and current learner time
budget can influence a later move without turning Repa into a todo planner.

The complete vertical behavior is:

```text
learner reports one precise learning-related assignment
-> model-facing command records a local Agenda Assignment
-> close and reopen in a fresh Session
-> compact assignment appears without old source prose
-> Tutor reads cold duration/value detail when it matters
-> current request and steering still govern the Turn
-> deadline crossing derives overdue without a write
-> correction, local completion, cancellation, and reopen remain truthful
```

The normative behavior and failure contract is
[`../proposals/0006-deadline-sensitive-real-work-contract.md`](../proposals/0006-deadline-sensitive-real-work-contract.md).

## Historical non-goals now withdrawn from product design

This slice does not add Goal, Course/Artifact/LMS association, durable time
budgets, subtasks, progress percentages, priority or learning-value scores,
persistent plans, notifications, scheduling algorithms, evidence, mastery, or
a generic `WorkItem` abstraction.

It also does not complete every assignment behavior in Capability 7. It proves
one cross-Session consumer and leaves broader goal relation, external truth,
multi-source reconciliation, and rich work artifacts for later pressure.

## Accepted assumptions and open questions

- Agenda owns Repa's local Assignment aggregate; Interaction owns immutable
  learner sources and model/tool occurrences.
- The first deadline has local civil minute precision. Ambiguous date-only or
  DST-ambiguous reports are clarified before structured admission.
- Learning-related/new-versus-existing classification is source-grounded,
  model-authored, inspectable, and correctable. No keyword rule or title/date
  uniqueness constraint pretends to solve semantic identity.
- Assignment is LearnerHome-scoped and remains available with no active Course.
- Current time budget stays in the current learner request. The model chooses
  the local trade-off; the program does not rank work with EDF or a scalar.
- No maintainer-owned product choice blocks this first slice. External source
  authority and durable Goal association remain explicitly deferred rather
  than guessed.

## Module and ownership map

| Path | Responsibility |
| --- | --- |
| `src/time/strict-offset-timestamp.ts` | domain-independent strict civil/offset parsing used by Assignment and existing timestamp consumers; no learning policy |
| `src/learning/agenda/future-attention-tool-execution.ts` | replace its private timestamp parser with the shared invariant; preserve Agenda command semantics |
| `src/tutor/learner-steering.ts` | replace permissive `Date.parse` admission with shared strict validation |
| `src/runtime/agenda-tools.ts` and `src/runtime/tutor-tools.ts` | keep historical provider-visible timestamp schemas stable while rewiring the shared pattern/parser |
| `src/storage/open-database.ts` | ordered schema 6 migration only |
| `src/learning/agenda/assignment.ts` | Assignment aggregate, legal transitions, semantic replay, temporal projection, compact/inspection/source queries |
| `src/learning/agenda/assignment-tool-execution.ts` | restore persisted invocation/context, bind trusted source/capability/version/time, parse untrusted model input, atomically settle |
| `src/runtime/assignment-tools.ts` | AI SDK/Zod capability descriptions and schemas only |
| `src/runtime/tutor-tools.ts` | compose and activate Assignment capabilities independently of active Course |
| `src/tutor/policy-profile.ts` | introduce `tutor-default-v4` while preserving v2/v3 provider contracts |
| `src/tutor/compile-context.ts` | add bounded LearnerHome Assignment contribution and full-count/truncation metadata |
| `src/tutor/render-system-prompt.ts` | render historical assignment facts as constraints/data, current request priority, and lazy-read guidance |

Do not add `manager`, `service`, `repository`, planner, selector, or workflow
layers. Existing context cuts, capability execution, FIFO/one-mutation
coordination, durable effects, tool settlement, and SQLite ownership already
provide the generic substrate.

## Phase 1: strict time invariant

Add focused tests before changing shared parsing:

- valid explicit-offset instants;
- impossible civil dates rejected rather than normalized;
- whole-minute enforcement for Assignment;
- normalized instant equality across equivalent offset spellings;
- IANA/offset agreement, including DST ambiguity; and
- existing Agenda/steering accepted timestamp behavior unchanged except that
  impossible civil dates now fail.

Move the already-earned strict calendar validation out of the future-attention
executor into `src/time/strict-offset-timestamp.ts`. Reuse it from Agenda,
timed steering, and Assignment with consumer-specific precision options. This
is a generic time invariant with three real consumers, not an Assignment
abstraction.

The v2/v3 Zod tool schemas and provider-visible regex stay byte-for-byte
equivalent; only executor admission tightens the existing invalid-date hole.
Tests must fail if the refactor leaves a second permissive parser or changes a
historical tool schema.

Proof:

```powershell
bun test test/strict-offset-timestamp.test.ts test/agenda-tool-execution.test.ts test/first-production-state-spine.test.ts
```

## Phase 2: schema and Assignment aggregate

Add schema 6 and a domain module with separate current and immutable-history
storage. The exact SQL may change during test-first implementation, but it must
enforce:

- host-created entity and effect identities;
- source item plus unique code-point span/excerpt;
- current title, normalized deadline, original offset input, interpretation
  time zone/model operation, admission rationale, disposition, and version;
- immutable revision/disposition transitions with command source and rationale;
- `open | completed | cancelled` local dispositions;
- `overdue := open && sampledAt >= deadline` as a query only; and
- no Course foreign key.

Implement and test create, revise without disposition change, complete only
when no local action remains, cancel local tracking, and atomic reopen with
optional corrected title/deadline. Every command derives a semantic effect
address from admitted learner occurrence, exact source span, Assignment ID
where applicable, and command slot; semantic replay precedes stale-state
rejection.

Queries must cover compact active context, paged active/recent-terminal
inspection, a bounded revision index, and bounded source windows with total
length/coordinates/truncation.

Proof:

```powershell
bun test test/storage-migration.test.ts test/agenda-assignment.test.ts
```

## Phase 3: trusted model-facing commands

Add Assignment capabilities through the existing bound executor:

- create;
- inspect/paginate active and recent-terminal assignments;
- read current or selected revision source windows;
- revise;
- complete;
- cancel; and
- reopen with optional corrected metadata.

The executor, not the model, binds current learner item, unique source span,
model operation, sampled context, entity version, capability grant, trusted
clock/time zone, effect identity, and settlement time. A mutation can target an
Assignment only when its ID/version was present in that immutable context or a
completed inspection visible before the new model sample. Physical retry,
semantic replay, context refresh, guessed IDs, rollback, restart, and committed
write followed by failed Turn all retain current runtime semantics.

At this phase the real capability proof covers Create and
`inspection receipt -> later model sample -> mutation`. The compact
context-visible grant does not exist until Phase 4 and must not be simulated by
hand-writing context JSON in an executor test.

Tests must include the cross-Input duplicate distinction: a later mention of an
existing assignment takes inspect/read/correct/clarify rather than automatic
create, while two genuinely different assignments may share title and
deadline. The latter is a behavior/capability case, not a SQL uniqueness rule.

Proof:

```powershell
bun test test/assignment-tool-execution.test.ts test/tutor-tool-binding.test.ts
```

## Phase 4: context, policy revision, and shared Tutor loop

Introduce `tutor-default-v4` because new tool schemas and prompt/context
contributions are provider-visible. First give v3 its own immutable exported
identity; `CURRENT` can no longer double as the historical v3 oracle. Keep:

- frozen `tutor-default-v2` replay behavior;
- exact `tutor-default-v3` conditional-purpose capability and schemas; and
- the v3 learner-response-before-disclosure meaning enabled under v4.

The conditional-purpose predicate returns true for explicit v3 and v4.
Assignment context, prompt contribution, and active tool names return true only
for v4. CLI `CURRENT_TUTOR_POLICY_PROFILE_REVISION` then moves to v4. Explicit
v2/v3 provider-contract tests must prove:

- active tool-name sets remain historical;
- v2 Agenda create has no learner-role field and v3 has it;
- v3 still composes the conditional current purpose; and
- neither v2 nor v3 exposes Assignment context, prompt text, or tools.

Tests that import `CURRENT` are v4 tests after the bump; they cannot count as a
v3 compatibility oracle.

Compile a small deadline-ordered active window, full active count, and explicit
truncation independently of `activeCourse`. Expose inspection whenever an
Assignment operation may be needed. Render deadline-first ordering as an
inspectable retrieval policy, not an action choice. Old source text is data,
not current steering.

End-to-end deterministic tests must cover:

- real model-facing create in one Session and compact consumption in a fresh
  Session with and without an active Course;
- lazy detail reads and source paging;
- current direct-help and retained-steering precedence;
- assignment, Course, Agenda concern, and evidence non-effects;
- hidden and terminal inspection followed by a later-sample legal mutation;
- natural learner-visible confirmation, inspection, explanation, and
  correction without internal IDs; and
- no durable plan after the 45-minute response.

Proof:

```powershell
bun test test/tutor-assignment-runtime.test.ts test/tutor-assignment-continuity.test.ts test/tutor-agenda-runtime.test.ts
```

## Phase 5: integration qualification and documentation

Run the full repository checks first. If they pass, run at most one bounded
provider integration pair through production code:

1. Earlier Session: the learner reports a precise learning-related assignment;
   the model-facing create command commits and the Tutor naturally confirms the
   interpreted deadline.
2. Fresh Later Session: the learner states a 45-minute budget and says
   “continue”; the Tutor notices the assignment, reads cold details, preserves
   the due learning concern, and makes a reasonable reversible trade-off.

Run one bounded non-learning-work negative control in the same fixed small
qualification: an ordinary job deliverable with a deadline must not cause the
model to create a learning Assignment. This is a required model-behavior gate,
not a deterministic database invariant or optional budget extra. If provider
availability or the reserved budget prevents it, record the qualification as
incomplete and do not mark this roadmap implemented.

Do not seed the domain row, require B2's exact minute schedule, run a broad
campaign, or use another model to grade an already decisive mechanical
failure.

Record actual implementation files, checks, policy-version compatibility, and
provider limitations in a production verification note. Update this roadmap
from planned to implemented only after fresh evidence exists.

Final proof:

```powershell
bun run check:reference
bun run typecheck
bun test
bun run check
```

## Rollback and drift rules

- Schema 6 is forward-only. If v4 provider behavior is unacceptable, preserve
  readable Assignment rows and restore the CLI's earlier policy revision; do
  not destructively downgrade the database.
- If an Assignment starts owning Course structure, learner ability, evidence,
  or the one-off plan, split/delete that meaning before extending it.
- If prompt wording is the only guard on identity, source, version, transition,
  or correction, move the invariant into the executor/domain.
- If deadline sorting becomes an unconditional priority policy, restore it to
  bounded retrieval plus model/learner choice.
- If duplicate admission pressure requires stable LMS identity, design the
  external source/reconciliation boundary; do not hash title and deadline.
- If implementation needs a general Task/Workflow abstraction to complete this
  one behavior, stop and re-audit the boundary.
