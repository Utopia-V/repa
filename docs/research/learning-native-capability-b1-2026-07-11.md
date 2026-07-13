# Learning-native capability Phase B1

Date: 2026-07-11

Status: deterministic lab complete. This is an implementation result for the
then-active roadmap, not a production schema or an educational-effectiveness
claim.

Scope clarification (2026-07-12): B1's `completed` revisit transition proves
that a future-attention item can be closed with a later, inspectable source and
then corrected or reopened. It does not prove that the later activity served a
stored learning purpose. Its learner/tool-only completion rule and table shape
are historical fixture choices, not production Agenda semantics. The later
purpose/alignment pressure result is recorded in
[`teach-adapt-return-architecture-proof-2026-07-12.md`](./teach-adapt-return-architecture-proof-2026-07-12.md).

## Question

Can a small executable learning layer preserve the facts needed by the current
capability contract, rebuild a useful later context, and reject forged state
without reviving the earlier evidence/projection/selector design?

## What was implemented

The isolated lab under `labs/learning-native-capability/` uses file-backed
SQLite and a controllable clock. It can retain:

- one active course, its broad route, and current section;
- the simple facts `read`, `explained`, `demonstrated`, and `followed`;
- actual attempts with outcome and assistance condition;
- pending, completed, cancelled, reopened, and rescheduled revisits;
- open, overdue, completed, cancelled, reopened, and revised assignments; and
- references to the Session items that justify attempt, progress, assignment,
  correction, and revisit-completion facts when those references matter.

The routine context contains the active goal, route, current position, a small
set of progress verbs, due revisits, open assignments, and an optional time
budget. Attempt contents, correction history, complete Session text, and
resolved records are retrieved only when requested.

## Model-facing write path

The deterministic tests also exercise a thin recorded-tool path:

1. the generic Session side records a tool call;
2. the runtime, not the model, attaches operation identity, revision,
   timestamp, Session, and source;
3. the learning command validates its source and preconditions;
4. one SQLite transaction writes the learning fact, operation record, and tool
   settlement; and
5. the settled result is projected back into generic Session history.

If result projection fails after commit, a fresh process can reproject the
existing settlement without executing the learning command again. If only a
tool-call record exists and the executor never settled it, recovery rejects it
instead of performing a new write.

## Checks that now pass

- close/reopen restores active course and current position without a caller
  supplying the course ID;
- raw explanation and answer text stay outside routine context;
- repeated progress becomes a compact set of verbs while full history remains
  queryable;
- attempts do not create mastery or a revisit automatically;
- assistant text cannot become a learner attempt or `followed` fact;
- sources must belong to the current Session and exist no later than the
  operation;
- a revisit cannot be completed by an interaction that predates the revisit;
- assignment and revisit resolution remain inspectable and can be explicitly
  reopened;
- correction keeps the original record and chooses the latest committed
  correction even when virtual timestamps are equal;
- time makes revisits due and assignments overdue, including the exact
  deadline boundary, without creating a new learning observation;
- operation time cannot move backwards, and context cannot inspect a time
  before committed state;
- stale, conflicting, forged, interrupted, and malformed writes do not leave
  partial learning state;
- a learning effect and its tool settlement commit atomically; and
- the migration path restores active course and correction order for an older
  lab database.

## Complexity removed during the lab

Two initially plausible additions were removed after review:

- `learningValue` and `goalRelevance` ratings on assignments, because they
  would give the learning-native condition a precomputed judgment that the
  shared Tutor should make from common material; and
- full progress event objects in routine context, because "this was explained"
  is enough until a later action needs time or source detail.

Recent attempts were also moved out of routine context. A due revisit may point
to an attempt, and the attempt can then be loaded explicitly.

## What B1 establishes

The current first-class learning concepts are implementable with small,
deterministic rules. They do not require a mastery model, knowledge graph,
workflow engine, or a second agent framework. Generic tool continuation and
Session history can remain generic while the project owns learning meaning and
atomic local transitions.

## What B1 does not establish

B1 did not call a live model. It does not show that a Tutor chooses good
actions, teaches well, improves retention, or outperforms a generic agent with
a learning skill. It also assumes one process-local writer and does not define
a multi-process SQLite protocol. In particular, its `completed` state does not
distinguish learner dismissal, an activity that served a future-attention
purpose, and evidence about learning; the current architecture keeps those
meanings separate.

## Historical next step (later completed by B2)

Phase B2 subsequently connected this lab to the shared headless Agent loop and
ran the six bounded behavior traces with live model calls. The model-facing
tool set was extended only when a trace needed a transition. The later
three-condition comparison was shelved and is not the current roadmap.
