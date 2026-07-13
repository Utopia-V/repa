# Engineering method

## Objective

Use AI to increase the rate of understanding and implementation without delegating architectural ownership. The project should remain understandable to a developing engineer and should not accumulate generated structure that only another model can navigate.

## Work sequence

For a new mechanism:

1. Locate the corresponding behavior in a mature reference implementation.
2. Trace its inputs, outputs, state transitions, failure paths, and tests.
3. State whether this project has the same problem.
4. Design the smallest complete boundary that solves this project's problem.
5. Write or approve the critical types and invariants.
6. Let AI implement bounded code inside the approved boundary.
7. Verify behavior with tests or a recorded oracle.
8. Remove temporary scaffolding and update the decision record.

This is neither a one-prompt generation workflow nor a permanent prototype. Experiments are allowed, but they are isolated from production code and are discarded after their conclusions are captured.

## Work at multiple scales

A large objective should be decomposed through its decisions and unknowns:

```text
product outcome
-> consequential boundary or unresolved claim
-> implementation, experiment, source study, or derivation that can settle it
-> evidence and explicit exit
-> return to the product outcome and choose again
```

A task is sufficiently small when one coherent piece of work can reach a
verified result or a useful negative conclusion. File count, artificial phase
names, and mechanically tiny commits do not define good task size. Every
subtask in consequential or uncertain work should retain its parent question,
so completing it does not silently turn its local vocabulary or preferred
solution into the next architecture. A bounded maintenance task with a clear,
reversible result can be implemented and verified directly.

Simple and reversible questions should remain simple. Use a documented
assumption when its failure is cheap to detect and undo. Reserve new frameworks,
general ontologies, state machines, and formal experiments for decisions whose
outcomes would actually change product behavior or an expensive boundary.

## Workflow and provider guidance

Skills, checklists, and agent workflows are working heuristics. They are not
project requirements, technical authority, or evidence that every named step
must be performed. This includes locally installed `superpowers` workflows:
use a step when it helps settle the current decision, not merely because the
workflow names it. When the question is how to prompt, evaluate, or operate a
particular model or provider, consult current first-party provider guidance
and prefer it over a personal workflow when it addresses the same problem more
directly. Provider guidance still does not override observed repository
behavior, accepted product intent, or an executable counterexample.

The amount of process must be proportional to the decision it can change. A
hard gate that has already settled promotion is an exit condition. Additional
reviewers, schemas, or adjudication are justified only when their result can
still choose between materially different actions.

For model-behavior evaluation, prefer task-specific cases drawn from the real
product distribution, executable or otherwise objective checks where the
meaning supports them, and narrow qualitative questions for the remaining
judgment. Calibrate model graders against human judgment before treating their
scores as measurements. Pairwise comparison or classification against one
specific criterion is generally safer than open-ended application of a large
rubric. Preserve disagreement as uncertainty when calibration fails instead of
manufacturing a precise aggregate.

Current first-party references for this default are OpenAI's
[evaluation best practices](https://platform.openai.com/docs/guides/evaluation-best-practices)
and Anthropic's
[evaluation design guidance](https://docs.anthropic.com/en/docs/test-and-evaluate/develop-tests).

## Collaboration context and taste

The main agent context owns synthesis, consequential decisions, and the
coherent implementation phase. It should not accumulate every raw search,
discarded lead, long log, or reference file merely because the agent can read
it. When a bounded read-only investigation is expected to produce much more
raw context than its final conclusion, it may run in a fresh worker context
with an explicit parent question, scope, evidence contract, and unknowns. The
main agent does not repeat the same exploration; it verifies only evidence that
can change the decision. Worker and compaction summaries are navigation aids,
not technical authority. When there is no genuinely non-overlapping main work,
the agent uses one task-sized event wait that returns immediately on worker
activity or new user input. In Codex this is normally 10–30 minutes and may use
the one-hour tool limit for genuinely long work. Routine wait timeouts are not
failures and do not justify heartbeat narration, status polling, premature wrap
requests, or invented duplicate work.

After conversation compaction or a new session, consequential work is rebuilt
from accepted product documents, ADRs, relevant source, tests, and recorded
oracles. A handoff summary points to that evidence but does not replace it.
Large raw outputs that may matter later should retain a stable backing artifact
while the main context receives a bounded view.

The maintainer should not have to enumerate every implementation detail or
guess why a question is being asked. Before requesting input, the agent first
researches factual questions and forms a recommendation. Ask only when the
answer can change product behavior, an acceptable trade-off, or an
expensive-to-reverse boundary. State the live decision, why it matters now,
the recommended answer, and what materially changes under another answer.
Cheap reversible details remain agent decisions.

Maintainer correction is control feedback, not a prompt to explain the
corrected concept back to its source. The agent first identifies the invalid
prior claim, then audits the decisions, documents, code, tests, and plans that
depended on it. It repairs or proposes the smallest affected change and states
when no durable artifact was touched. A paraphrase is useful only when it
resolves a real ambiguity.

An explicit `grill-me` interaction may explore several dependent product or
architecture choices, one at a time. It stops once remaining uncertainty is
cheap or no plausible answer changes the plan. Accepted durable decisions are
promoted to the appropriate project document; situational answers do not form
a timeless preference profile.

These collaboration defaults were informed by two practitioner reports from
LastWhisper, read on 2026-07-13:

- [Why does Codex keep auto-compacting?](https://zhuanlan.zhihu.com/p/2058727424167241456)
  supplies the context-economy hypothesis: delegate when raw exploration is
  much larger than its useful conclusion, keep the main context for synthesis,
  and do not defeat isolation by duplicating worker exploration while waiting.
  Its reported cost and context measurements are single-run observations, not
  universal benchmarks.
- [How is the `grill-me` Agent Skill in practice?](https://www.zhihu.com/question/2054005413406946147/answer/2054647380377597351)
  supplies the taste-and-control framing: expose consequential latent choices
  before fast execution and persist accepted decisions into shared project
  context. It does not justify interrogating the maintainer about factual,
  cheap, reversible, or non-controlling details.

The articles are provenance, not authority. Concrete tool defaults, wait
limits, model behavior, and provider guidance may change; retain the structural
principles only while repository trajectories and current first-party evidence
continue to support them.

## Reuse before invention

Before designing consequential generic machinery, identify the established
problem class when one exists. Runtime scheduling, mode composition, queues,
caching, concurrency, transactions, recovery, indexing, and performance often
have useful classical CS models and mature implementations. Study their inputs,
invariants, failure modes, and measurements before inventing a product-specific
mechanism. When a standard library, runtime facility, database, or maintained
API already owns the boundary, using it directly needs no ceremonial research
artifact.

OpenCode and Codex are concrete references for agent-runtime behavior, not the
only sources of design. Textbooks, standards, papers, language/runtime
facilities, databases, and smaller focused libraries may provide a better
model. Reuse the mechanism or invariant when Repa has the same problem; keep
learning semantics owned here when the problem is genuinely domain-specific.

## Human-owned decisions

The maintainer owns product goals, values, and acceptable trade-offs and must be
able to explain and approve:

- module boundaries and dependency direction;
- the agent run state machine;
- durable session and message semantics;
- tool-call states and interruption behavior;
- permission and confirmation boundaries;
- learning evidence and state semantics;
- transaction, recovery, and migration behavior.

Human ownership does not make every technical instruction correct. Source
behavior, failure properties, and empirical claims remain subject to evidence.
AI should challenge a technically unsound means with concrete reasoning while
preserving the maintainer's intended outcome.

## Appropriate AI work

AI is useful for:

- navigating and explaining reference source;
- finding call sites and missing failure paths;
- implementing adapters against an approved interface;
- writing tests that exercise real behavior;
- checking duplication and architecture drift;
- reviewing a change against repository invariants;
- performing mechanical edits after the semantic change is understood.

AI must not invent a new subsystem while implementing an unrelated feature. When a missing architectural decision is discovered, implementation stops at that boundary and records the decision explicitly.

## Meaning preservation

Conversation is useful for discovering intent but is not a durable
specification. Natural-language summaries can preserve the vocabulary while
losing the operational meaning.

Before a critical implementation slice, record a small semantic checksum:

```text
product-loop purpose
owned durable fact or invariant
one representative behavior
one counterexample or prohibited behavior
failure and correction behavior
```

Use more than one scenario when a single repeated example may bias the design.
An emergency exam-planning scenario, for example, cannot by itself define the
steady-state behavior of a long-running Tutor.

Accepted product intent, accepted ADRs, working hypotheses, research findings,
and illustrative examples have different authority. Promotion between them is
explicit. A research term such as `LearnerClaim` or `TaskFamily` does not become
a class, table, or package merely because it helped explain a problem.

Tests and recorded oracles should encode observable consequences rather than
internal wording. A refactor may change the prompt or representation while
preserving the meaning; an unchanged prompt may still violate the meaning if
its surrounding context or tools change.

## Disagreement protocol

Neither the maintainer nor an AI reviewer is treated as infallible.

When a requested means conflicts with evidence or an accepted invariant:

1. identify the intended product outcome separately from the proposed means;
2. cite the source, test, trace, or failure case that creates the conflict;
3. state whether the conflict is factual, architectural, or a value trade-off;
4. propose the smallest reversible way to preserve the outcome;
5. request a maintainer decision only when the remaining choice materially
   changes product behavior or an expensive-to-reverse boundary.

Do not use deference to conceal a known engineering problem. Do not use
technical confidence to replace a product value chosen by the maintainer.

For consequential boundaries, an independent model or human review can expose
blind spots. Agreement between reviewers is supporting evidence, not proof;
the repository's sources, invariants, and executable behavior remain decisive.

## Production and lab separation

- `labs/` contains mechanism experiments with an explicit question and deletion condition.
- Production code must never import from `labs/`.
- A successful experiment contributes a written conclusion and tests/oracles; its structure is not automatically promoted.
- A failed experiment is deleted rather than maintained for sentiment or sunk cost.

## Change acceptance

A production change is acceptable only when:

- its product-loop purpose is named;
- its owner and dependencies are clear;
- state transitions and failures are explicit;
- validation exists at untrusted boundaries;
- persistent changes have migration/recovery behavior;
- relevant checks pass;
- no duplicate domain concept was introduced.

## Avoiding local-gradient traps

At each phase boundary, review the repository from the product loop outward rather than from the latest file inward. A locally elegant implementation is rejected when it increases generic-agent scope, obscures learning semantics, creates a second source of truth, or makes future state correction harder.

The phase review also checks whether conversation shorthand, one vivid example,
or a temporary experiment has silently become architecture. If so, recover the
underlying invariant and delete the accidental structure.

The same check applies inside a long plan. Passing one test, improving one
metric, or making one module elegant is not automatic permission to optimize it
again. Re-evaluate whether the parent product uncertainty is now settled, has
changed, or should be abandoned.
