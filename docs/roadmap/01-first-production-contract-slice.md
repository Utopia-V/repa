# Conditional plan: first production contract slice

Date: 2026-07-10

Status: Archived; not a current roadmap. Paused after ALS-015/ALS-016. The maintainer accepted the foundation
defaults on 2026-07-11, but the simulated-student benchmark did not validate
the proposed evidence representation or demonstrate inferred-state selector
advantage. Work packages 2 through 4 must not be implemented as written. The
later deterministic-task proposal is also paused because it overweights
gradable practice. Current product behavior is restated in
[`../foundation/02-what-the-tutor-does.md`](../foundation/02-what-the-tutor-does.md).
The active path is
[`03-learning-native-behavior-baseline.md`](./03-learning-native-behavior-baseline.md).

## Goal

Build one headless, production-quality path in which:

~~~text
durable user Turn
-> formal task selected under known context
-> source-linked learner result
-> correctable evidence interpretation
-> atomic local tool settlement
-> rebuilt learner projection and candidate reasons
-> revised context for the next logical model operation
~~~

The slice proves that learning semantics constrain the real harness. It is not
a demo UI, throwaway MVP, or complete learning platform.

## Non-goals

This plan does not include:

- a full-screen TUI;
- provider routing or fallback;
- a complete scheduler or retention model;
- an open-world curriculum schema;
- Anki, Obsidian, PDF, MCP, shell, or external writes;
- durable mid-Turn steering or pending approval;
- generic effect receipts or workflow recovery;
- subagents, multi-agent orchestration, or cloud state.

## Foundation activation gate

Status: Satisfied on 2026-07-11.

Before production code begins, the maintainer reviews the five defaults in the
foundation proposal:

1. durable Turn boundary;
2. process-local first-slice steering;
3. one SQLite transaction for a local learning write and tool settlement;
4. distinct task-result, evidence-interpretation, projection, and correction
   roles; and
5. finite Turn continuation limits.

The maintainer accepted all five defaults. ADR-0005, ADR-0006, and ADR-0007
record the resulting normative boundaries.

## Learning-contract gate

Status: Failed on 2026-07-11.

The frozen formal result and the single permitted follow-up found:

- condition-bearing evidence was more exact than answer-only interpretation,
  but the model still emitted one illegal false-independent claim per trial;
- deterministic admission rejected every illegal candidate;
- a proposed criterion-level replacement did not meet its frozen semantic or
  prompt-robustness gates; and
- stateless, oracle-state, and inferred-state selectors all scored 6/6, so the
  scenarios did not demonstrate state-layer value.

Consequently the provisional evidence, projection, and selector types below
remain historical planning material, not implementation authorization.

## Work package 1: promote only accepted contracts

Draft small ADRs for:

- the Session/Turn/logical-model-operation/tool hierarchy;
- the local learning transaction and correction boundary; and
- process-local coordination plus finite continuation limits.

Each ADR names ownership, legal transitions, persistence, recovery, and one
counterexample. No umbrella "agent architecture" ADR is created.

Verification:

- every statement is either already accepted, explicitly approved in review,
  or remains in a proposal;
- no research vocabulary is promoted merely because a reference uses it.

## Work package 2: production learning transaction

Implement the smallest persistent domain operation required by the positive
path.

Provisional files, subject to collapse when a boundary has only one consumer:

~~~text
src/storage/open-database.ts
src/storage/migrations/0001-foundation.sql
src/learning/record-formal-task-result.ts
src/learning/rebuild-learner-projection.ts
src/learning/assemble-learning-context.ts
test/learning-transaction.test.ts
~~~

Required behavior:

- Session source text remains authoritative and is referenced, not copied;
- task context and result conditions are validated;
- evidence interpretation is durable and retractable;
- projection is rebuildable from active interpretations;
- local obligations are revised with the same transaction;
- exact operation replay is idempotent and conflicting reuse fails; and
- the matching local tool settlement commits atomically.

The lab schema is not copied. Production names are chosen from accepted
ownership and consumers.

Verification:

- transaction rollback at every injected boundary;
- correction preserves source history;
- projection delete/rebuild equivalence;
- passage of time changes due candidates without inserting evidence.

## Work package 3: durable Turn and serialized owner

Implement only the interaction state needed by the same learning path.

Provisional files:

~~~text
src/session/start-turn.ts
src/session/finish-turn.ts
src/session/interaction-items.ts
src/agent/turn-owner.ts
src/agent/continuation-budget.ts
test/turn-lifecycle.test.ts
~~~

Required behavior:

- initial user item and running Turn commit before model work;
- one resident Session has at most one active Turn owner;
- Turn terminal outcomes are completed, failed, interrupted, or exhausted;
- process restart interrupts an orphaned running Turn without redispatch;
- model-operation settlement is independent of tool settlement; and
- model-operation and tool-call counters stop continuation before another
  cycle begins.

Mid-Turn steering remains live-only and is documented honestly.

## Work package 4: minimum model/tool loop

Use a recorded deterministic model-event fixture first so transport behavior
does not hide lifecycle bugs. Add a real provider only after its choice and
credential boundary are reviewed.

The recorded fixture tests runtime mechanics; it is not evidence that a real
model follows the learning policy. After one provider is selected, add a
separate opt-in live integration test that uses maintainer-supplied credentials.
Normal contract tests remain offline and deterministic. The live test verifies
request translation, streaming, tool calls, result continuation, and termination
without asserting exact prose.

Codex's current model connection and the private ChatGPT Pro bridge are not
implicitly available to the application and are not production provider APIs.
Repa must not depend on either private runtime. No paid model call occurs in
tests unless the maintainer enables it explicitly.

Provisional files:

~~~text
src/agent/drive-turn.ts
src/model/model-events.ts
src/tools/execute-tool-invocation.ts
src/tools/record-formal-task-result-tool.ts
test/headless-learning-loop.test.ts
~~~

Required trace:

1. a Turn starts from durable input;
2. one logical model operation emits a complete formal-task action;
3. a later answer item is linked to that task;
4. the learning tool commits result, interpretation, projection, obligation,
   and settlement atomically;
5. the next context names the revised projection and reasons; and
6. materially different formal results produce materially different candidate
   reasons under the same goal.

A model adapter may translate provider events, but provider types do not enter
Session or Learning Domain state.

## Work package 5: adversarial review and cleanup

Before adding UI:

- compare the implementation against the accepted ADRs and both proposals;
- inject failures before and after every SQLite transaction boundary;
- search for duplicated Session, evidence, projection, and tool-state concepts;
- delete any abstraction created only for the deterministic fixture;
- run the full repository checks; and
- produce a concise review packet showing data flow and remaining omissions.

## Unattended execution boundary

After activation, work packages 2 through 4 can run without maintainer input if
all changes remain local, reversible, and inside the approved contracts.

Execution stops rather than guessing when:

- a choice changes learner-visible behavior beyond the approved oracles;
- a schema requires a general curriculum or mastery ontology;
- an external effect needs reconciliation;
- a provider-specific constraint changes the Turn/tool contract;
- migration compatibility with released user data becomes relevant; or
- a new abstraction has no current invariant and consumer.

The unattended run must not commit, push, publish, access personal learning
material, or call paid external models unless separately authorized.

## Completion evidence

The slice is complete only when:

- the full repository check passes;
- local Markdown links resolve;
- the vertical headless test uses production modules rather than lab imports;
- the lab remains isolated or is deleted once production tests supersede it;
- the same source result can be corrected and rebuilt;
- a Turn cannot continue indefinitely; and
- the maintainer can trace one user input through every durable boundary to the
  revised next-action context.
