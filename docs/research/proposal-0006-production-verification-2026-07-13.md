# Proposal 0006 implementation and qualification record

Correction (2026-07-13): the provider observations and deterministic test
results below remain historical evidence, but the selected 45/25/30-minute
pressure scenario was outside Repa's product scope.
The failure therefore does not establish a missing near-deadline consideration
mechanism, and the proposed next research boundary is withdrawn. Proposal 0006
and dormant v4 are unaccepted; see
[`semantic-drift-audit-2026-07-13.md`](./semantic-drift-audit-2026-07-13.md).

Date: 2026-07-13

Status: Deterministic `tutor-default-v4` candidate implemented; live
DeepSeek-V4-Flash qualification **failed**. Schema 6 and the explicit v4 policy
remain readable and testable, but `CURRENT_TUTOR_POLICY_PROFILE_REVISION` and
the CLI remain on qualified `tutor-default-v3`.

## Outcome in plain language

Repa now has a coherent, source-grounded Assignment capability behind an
explicit policy revision. It can remember a real learning-related assignment
across Sessions, derive overdue state from time, read old details lazily,
inspect and correct its interpretation, and preserve completion/cancellation/
reopen history without changing Course progress or inventing learning
evidence.

That engineering boundary is not the same as a reliable Tutor behavior. In
live runs, DeepSeek-V4-Flash sometimes created the Assignment and sometimes did
not. More importantly, it repeatedly started new teaching while a report was
due in 30 minutes and the learner had only 45 minutes, despite the compact
deadline, explicit countdown, due learning concern, and guidance to read cold
detail before choosing a trade-off. The v4 policy is therefore not enabled by
default.

## Implemented boundary

- Schema 6 adds a LearnerHome-scoped `agenda_assignment` aggregate and
  immutable transition history without a Course foreign key.
- `create | revise | complete | cancel | reopen` own legal dispositions,
  entity versions, exact learner-source spans, normalized deadlines,
  interpretation provenance, semantic replay, and atomic settlement.
- Active and recent-terminal inspection page separately. Selected-version
  reads return bounded source windows plus a paged revision index; routine
  context contains no old source prose.
- `overdue` and deadline countdown are query-time facts; crossing time performs
  no write.
- Assignment capabilities compose at LearnerHome level even without an active
  Course. v2/v3 prompt, context, and tool contracts remain Assignment-free.
- Strict civil-time parsing is shared by Agenda, timed steering, and Assignment
  while preserving historical minute-or-second steering input.
- One-off planning remains Session interaction. No Goal, scheduler, priority
  score, learning-value field, evidence, mastery, or generic WorkItem was
  added.

## Independent review findings closed before qualification

Three independent read-only reviews found concrete defects rather than giving
a confidence vote. The implementation now proves the corresponding repairs:

1. minute-precision timed steering and ISO end-of-day compatibility no longer
   regress under the shared strict parser;
2. creation and every later version retain inspectable deadline, time-zone,
   model-operation, rationale, and source-coordinate provenance through a
   bounded revision index;
3. complete/cancel and other terminal semantic retries can reach replay before
   a now-hidden entity fails the capability gate;
4. equivalent offset spellings compare by normalized instant while the first
   spelling remains provenance;
5. overlapping source matches and astral-code-point fragments fail exact-span
   admission; and
6. an unrelated global commit does not stale an otherwise current Assignment
   entity version.

The reviews found no evidence that Assignment had taken ownership of Course,
learner ability, evidence, scalar priority, graph representation, or a general
task/workflow abstraction.

## Deterministic evidence

The final fresh repository gate passed:

```text
bun run check:reference  pass
bun run typecheck        pass
bun test --isolate       264 pass, 0 fail, 1644 assertions
bun run check            pass
```

The tests cover migration rollback/reopen, exact and semantic retry, strict
time/DST behavior, source ambiguity, transaction rollback, entity-version
staleness, compact/fresh-Session context, lazy detail, historical policy
identity, no-Course operation, direct-help non-effects, correction/reopen, and
one-off-plan non-persistence. The existing provider-replay fixture still
reproduces all 29 frozen v2 requests with equivalent provider-visible input.

A pre-existing Windows `EBUSY` race in the Course tool test twice prevented a
full-suite zero exit after all assertions had otherwise passed. That test did
not need database reopen, so its SQLite fixture was correctly moved in-memory;
the next two full gates completed cleanly.

## Live provider qualification

The bounded qualification used production database migrations, context
compiler, prompt renderer, tool binding, Tutor loop, and
DeepSeek-V4-Flash with thinking disabled and hidden retries disabled. It
covered:

1. an earlier Session reporting a precise coursework report and remaining work;
2. a fresh Session 30 minutes before its deadline with a 45-minute budget, an
   active Course, and a due learning concern; and
3. an ordinary company deliverable explicitly unrelated to learning.

The first attempt exposed a harness defect: it stopped on the first failed gate
without saving the response. The harness was corrected to preserve all three
outcomes. Subsequent diagnostic/corrective runs were kept to the same three
bounded situations; no broad campaign or reviewer model ran.

Observed failures across those runs:

- the later Session repeatedly did not call `read_assignment_source` and began
  teaching new JavaScript material without mentioning the report;
- before the admission wording was tightened, the ordinary company deliverable
  caused `create_assignment`; the strengthened source category boundary fixed
  that negative control in the next run;
- one creation response narrated tool reasoning and exposed an internal
  Assignment ID; a later candidate prompt forbids this, but the final run did
  not create an Assignment and therefore could not qualify the repair; and
- after adding a deterministic deadline countdown and stronger broad-request
  consideration guidance, a final run created zero Assignments in the earlier
  Session.

Two complete diagnostic runs used 30,405 input / 1,805 output tokens (estimated
upper bound $0.0047621) and 19,415 input / 1,546 output tokens (estimated upper
bound $0.00315098), respectively. The initial observability failure and final
early stop did not produce complete accounting, so no invented total is
reported. Ignored local output contains no API key or headers.

## Corrected decision

The provider result remains a truthful failure of the tested implementation,
but the former consideration question was inferred from an invalid product
oracle. It is not the next research boundary. Persistence, authority,
correction, and recovery were demonstrated only for the narrow v4 shape; they
do not justify preserving that aggregate by sunk cost.

The next Assignment work must begin with representative multi-day workload,
capacity, progress, and replanning consumers. Strict time, provenance,
transition, and replay mechanisms may be reused only if that corrected design
needs them. Deadline-first context and model-owned one-Turn scheduling are not
admitted policies.

As a result:

- `tutor-default-v4` is explicit opt-in only;
- the CLI remains on `tutor-default-v3`;
- Roadmap 08 is withdrawn as an active roadmap item; and
- no more prompt or control rescue samples are authorized for this emergency
  fixture.
