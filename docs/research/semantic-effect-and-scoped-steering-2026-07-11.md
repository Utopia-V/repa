# ALS-018: Semantic effect identity and scoped learner steering

Date: 2026-07-11

Status: Completed deterministic production-boundary result. No live model call
was made.

Current scope note (2026-07-12): the source-grounding, scoped steering,
semantic replay, correction, expiry, and context-contribution behavior remains
an executable oracle. The surrounding Session, Turn, model-operation,
tool-invocation, recovery, and global-revision implementation is now a runtime
substrate candidate rather than a settled production spine. See
[`broad-route-and-runtime-substrate-review-2026-07-12.md`](./broad-route-and-runtime-substrate-review-2026-07-12.md).

## Parent question

ALS-017 established that a model can initiate a real, source-bound learning
write while the program retains durable authority. It then exposed two linked
failures:

1. the fresh Session did not receive the still-live learner instruction
   `今天先别测我`; and
2. a new physical tool-call ID could write the same semantic learning effect a
   second time when compaction or resampling exposed the same admitted input.

The question for ALS-018 was whether those failures required a preference
manager or generic command framework, or whether one narrower production
boundary was sufficient.

## Negative probe against B1

Before production code, the B1 executor received the same source-linked
`record_progress(read)` payload twice with:

- the same durable learner source item;
- two different physical tool-call IDs; and
- the correct successive revisions.

Both writes committed. The learning revision advanced twice and history held
two active progress records. The current view showed only one `read` value
because it grouped progress by kind.

This isolated the failure: projection-level deduplication hid duplicate state,
while call-ID idempotency did not prevent it.

## Derived identity model

The accepted model is:

```text
physical invocation
  one concrete tool call and settlement

semantic effect identity
  command kind
  + durable causal occurrence
  + command-specific effect address

provenance
  source and authorship supporting the effect
```

人话：工具调用 ID 是快递单号，持久语义效果是账本里的那一笔，来源是凭证。换
快递单号不能多记账；真正发生了第二次，则必须有新的发生身份。凭证也不能被重
试悄悄替换。

The durable causal occurrence is command-specific. A learner report may use
its admitted Input. An attempt needs an attempt occurrence. A Tutor explanation
must not become `explained` before a completed, delivered teaching occurrence
exists. Assignment and revisit creation still need stable domain-owned entity
or commitment slots before their lab shapes can be promoted.

## Retained steering model

The first retained policy contribution is deliberately narrower than a general
directive system:

```text
one admitted learner input
-> one learning-wide, time-bounded steering slot
-> source-grounded verbatim excerpt
-> absolute [effectiveFrom, validUntil) interval
-> active contribution recompiled for each model sample
```

It is not a stable preference or learning evidence. Expiry changes a query,
not history. A current, more specific learner request can override it for one
Turn without silently retracting it.

The model-facing write accepts an ISO-8601 timestamp with an explicit offset.
The runtime parses it once into an absolute instant and retains the model
operation and runtime timezone as interpretation provenance. The first version
limits the excerpt to 1000 Unicode code points and requires it to be an exact
substring of the runtime-bound learner source.

The contribution is explicitly learning-wide. Section-, course-, Session-, and
condition-scoped instructions are not generalized from this one case. A local
or referential instruction remains in current Session history until a stable
scope identity has a real later consumer.

## First formal production code

ALS-018 starts `src/` with four ownership boundaries:

- `src/storage/` opens and migrates the authoritative SQLite database;
- `src/interaction/records.ts` owns Session, admitted Input, Turn, model
  operation, physical tool invocation, and startup recovery records;
- `src/tutor/learner-steering.ts` owns the command-specific semantic effect,
  replay/conflict rules, withdrawal, and atomic settlement; and
- `src/tutor/compile-context.ts` owns the immutable per-sample Tutor context
  cut and model-facing retained-policy fragment.

No production file imports a lab.

## Executable outcomes

The deterministic production test covers:

1. exact Input replay versus identical text in a new Input;
2. immutable context-cut admission and rejection of a cut before durable
   history;
3. exact physical invocation replay and conflicting invocation-ID reuse;
4. different physical calls settling to one semantic effect;
5. semantic replay before stale-revision rejection;
6. conflicting value under one semantic address;
7. close/reopen, explicit orphan recovery, and later-Session context;
8. half-open expiry without a state revision;
9. rejection of a newly admitted effect after its interval already expired;
10. an expired or retracted effect remaining tombstoned under replay;
11. source-linked withdrawal with separate operation and target identities;
12. rollback when tool settlement fails after tentative effect writes;
13. one running model operation per Turn;
14. two SQLite connections settling two invocations to one effect;
15. generic successful read-only settlement without a fake learning effect;
16. source grounding and excerpt size bounds; and
17. retained instruction ordering and model-facing later-wins policy;
18. a global state-transition clock that rejects backdated new effects;
19. causal Turn chronology across model, tool, termination, and recovery
    events;
20. atomic context compilation and model-operation admission across a
    pure-time expiry boundary; and
21. separate finite model/tool limits with durable, exact-replayable exhaustion
    receipts.

The focused test has 14 cases and 111 assertions. A fresh full `bun run check`
passed reference verification, both TypeScript projects, and all 96 repository
tests with 698 assertions.

## Review-driven corrections

Two independent reviewers found several defects after the first green run:

- orphaned running work could survive restart and commit later;
- Turn/model/tool check-then-write paths were not all transactionally
  serialized;
- invocation creation time was being used as settlement time;
- withdrawal output mixed the withdrawal effect ID with its target ID;
- the generic tool schema required every successful tool to fabricate a
  learning effect;
- multiple model operations could remain running in one Turn;
- a caller could pass a mutable or temporally invalid context cut;
- conflict precedence was missing from the model-facing policy; and
- the tool's name, timestamp shape, and excerpt size did not reveal the v0
  boundary clearly enough.

A later review pass also found that:

- pure passage of time could age a precompiled cut without changing revision;
- several terminal shortcuts could write timestamps before existing child
  events;
- finite limits existed in the ADR but not yet in the production path; and
- an exhaustion response could be lost because the rejected attempt had no
  durable terminal receipt.

The production implementation and tests were tightened for each issue. This
history matters: the result was not accepted merely because the first test run
was green.

The first full check also exposed a frozen ALS-016 execution manifest pointing
at the live lab `package.json`, which ALS-017 had legitimately extended. The
old file bytes were reconstructed from the unchanged registered hash and moved
to a historical snapshot; the manifest now points there without changing the
expected hash. This preserved the experiment rather than blessing the current
file with a refreshed hash.

## What is established

- A model write can retain temporary learner steering without converting it
  into a preference or ability claim.
- A context cut can change with time even when durable state revision does not.
- Physical call settlement and semantic domain effect are separate durable
  identities.
- An identical semantic replay may settle after unrelated state advanced,
  while a genuinely new stale effect remains rejected.
- Retraction and expiry do not release the original semantic identity for reuse.
- Explicit process-start recovery is required before new Session ownership;
  merely opening a second SQLite connection is not proof of a restart.
- Context compilation and model-operation admission are one sampling action;
  a pre-expiry preview cannot become a post-expiry request.
- Finite Turn exhaustion is a recoverable terminal outcome, not a fabricated
  model or tool operation.

## What is not established

- that a model will reliably choose the retention tool;
- that prompt injection alone will always obey the steering;
- a universal learner-directive ontology or scope language;
- production identities for progress, revisit, assignment, or attempt writes;
- a production provider, terminal renderer, or complete agent loop;
- course/material position representation; or
- improvement in teaching quality or learning outcomes.

## Parent-level consequence

The two ALS-017 control-loop boundaries are now sufficiently explicit for the
first production state/context spine. The next parent decision should return to
the Tutor's central work: what smallest broad course/material-position state
lets a later Session teach or continue naturally without copying the B1 route
schema. Another idempotency benchmark or directive taxonomy is not the default
next step.
