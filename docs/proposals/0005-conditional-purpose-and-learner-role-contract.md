# Proposal 0005: Conditional purpose and learner-role contract

Status: Implemented as the bounded `tutor-default-v3` production contract; not
accepted as a general constraint framework.

Date: 2026-07-13

## Plain-language summary

For the one behavior now proved, Repa needs to remember two different things:

- **why to return** — “check whether the learner can predict this alias change
  independently”; and
- **what the Tutor must not do first** — reveal the answer or a decisive hint
  before the learner responds.

The first is the Agenda reason. The second is an operative learner-role
constraint. ALS-022E showed that leaving the second meaning buried in prose is
not reliable enough: the model often taught the answer-producing rule before
asking the learner to predict.

This proposal adds one optional, narrow constraint to an Agenda concern and
projects it only when one legal concern is the current conditional default. It
does not add a lesson plan, activity record, mode, selector model, or general
pedagogy vocabulary.

## Evidence boundary

The proposed contract follows these observed results:

- ALS-020: purpose and learner role cannot be recovered from target/time alone.
- ALS-021: eligible Agenda reason as background produced 0/8 valid
  independent-prediction returns.
- ALS-022A: explicit selected purpose plus operative constraint produced 7/8
  purpose-valid returns and 8/8 without answer leakage.
- ALS-022B/C: two mandatory selector shapes failed 12/22 and 10/18.
- ALS-022D: a program-bound one-candidate conditional default plus exact current
  request priority passed 10/10 contrasting behaviors.
- ALS-022E: removing the explicit constraint reduced strict validity to 3/8.

Only the `learner response before Tutor disclosure` boundary is admitted. No
other constraint kind is implied.

## Meanings and ownership

| Meaning | Owner | Persistence |
| --- | --- | --- |
| future-attention reason and target | Agenda | durable across Sessions |
| learner-role constraint attached to that reason | Agenda | durable, versioned with the concern |
| legal/current/default projection | Tutor composition | immutable model-operation context cut |
| exact current learner request | interaction / admitted Turn | durable Session item; higher priority |
| wording, example, question, explanation, tools | model-led Tutor realization | Session/tool history as applicable |
| completed service occurrence | interaction plus Agenda command | durable only after completion/alignment |
| learning evidence or mastery | future learner/evidence authority | never implied by this contract |

The constraint belongs with Agenda because it changes both later realization
and whether disclosure-before-response can truthfully count as serving the same
concern. It does not belong to generic Tutor policy: it is source-bound to one
future-attention meaning and disappears when that concern is terminal or
superseded.

## Proposed narrow domain shape

Extend `FutureAttentionConcern` and its context/inspection projections with one
optional value:

```ts
type FutureAttentionLearnerRoleConstraint = Readonly<{
  kind: "learner_response_before_tutor_disclosure"
}>

type FutureAttentionConcern = {
  // existing fields
  learnerRoleConstraint?: FutureAttentionLearnerRoleConstraint
}
```

Semantics of the one kind:

> Before a learner response intended to serve this concern, the Tutor must not
> disclose the answer or a hint that removes the central decision. The exact
> `reason` states what response and target matter.

It does not claim:

- that no outside assistance occurred;
- that the learner's response is correct;
- that the learner has mastered the target;
- that every hint is prohibited;
- that a quiz is required; or
- that prediction is the universal learning action.

The type is deliberately a one-member union rather than a string registry. A
second kind requires its own collision/counterexample evidence and consumers.

## Creation and correction

### Create

The existing create command/tool may optionally carry the one exact kind.
Admission rules:

- `reason` remains required and bounded;
- the optional kind must match the one supported literal;
- source item, model operation, target, time, authorship, and effect identity
  remain trusted/bound exactly as today;
- the command's semantic value JSON includes the constraint, so a replay with a
  different constraint conflicts; and
- a model may propose the constraint, but the domain accepts only the known
  kind and never infers stronger evidence.

The model-facing tool description should request the constraint only when the
future return specifically requires a learner response before Tutor disclosure.
“Review this later,” “explain another way,” and “compare these cases” do not
silently acquire it.

### Correct or supersede

The existing learner-bound supersession command is the correction path. A
learner correction may replace reason, time, target, and the optional
constraint together. The old concern becomes `superseded`; the successor owns
the corrected value and preserves causal history.

Replay value JSON for supersession includes the replacement constraint. A
conflicting retry fails. No in-place semantic edit is added.

### Migration

Existing concerns migrate with no constraint. Never parse or backfill one from
old free-text reasons. Old concerns remain inspectable and usable as candidates,
but this first conditional-default policy does not promote them merely because
their prose resembles the new kind.

This conservative migration prevents a new code revision from retroactively
changing what an old Tutor/learner source meant.

## Proposed conditional context contribution

Add one optional structured contribution to `TutorContext`:

```ts
type ConditionalCurrentPurpose = Readonly<{
  kind: "agenda_future_attention"
  priority: "below_exact_current_request"
  source: Readonly<{
    concernId: string
    concernVersion: number
    sourceItemId: string
    target: CourseItemTargetRef
    exactReason: string
  }>
  learnerRoleConstraint: Readonly<{
    kind: "learner_response_before_tutor_disclosure"
  }>
  scope: "current_turn"
}>
```

This is a proposal-level shape, not authorization to copy the names unchanged
into production. Its invariants are the important part:

- exact source identity and meaning;
- one explicit priority relation;
- one demonstrated operative constraint;
- bounded Turn scope; and
- no completion/evidence field.

The model-operation row already owns Turn/session identity, so the serialized
context need not duplicate IDs solely for convenience if the persisted cut and
row together remain self-explanatory.

## Deterministic promotion policy

The first consumer is deliberately narrow. Composition creates the conditional
contribution only when all are true:

1. the active course exists;
2. the concern is open, eligible, and targets the current Course View;
3. the full legal eligible-current count is exactly one, even if routine
   context is truncated;
4. the concern carries the exact supported learner-role constraint; and
5. the policy revision explicitly enables this first demonstrated consumer.

Upcoming and superseded concerns are never legal defaults. If two legal
eligible concerns exist, neither becomes this conditional default. The bounded
candidate list remains available for ordinary reversible choice or learner
clarification.

The count must come from an untruncated query/count, not from “one item happened
to fit in the first eight results.” This avoids silently selecting one hidden
among several.

No LLM selector call runs. The next normal model sample receives both the exact
current request in message history and the conditional contribution in its
immutable context cut.

## Rendering semantics

Prompt rendering must distinguish historical candidate text from operative
constraint. A model-facing rendering can say, in provider-neutral terms:

```text
Conditional current learning purpose (below the learner's exact current request):
- exact source-bound reason: ...
- learner-role constraint: obtain the learner response before disclosing the
  answer or a decisive hint
- override: an explicit incompatible current request wins for this Turn and
  leaves the concern open
- non-effect: asking, explaining, or selecting does not address Agenda or prove
  learning
```

The rendering must not tell the learner about “Agenda,” concern IDs, policy
precedence, or control decisions. Natural dialogue may refer to the remembered
intent—“上次你想先自己预测”—when pedagogically useful.

Current provider traces show that an instruction not to narrate control terms
is not itself a guarantee. The first production tests must inspect final
learner-visible text, not only provider input.

## Learner-visible response wording

Provider `text-delta` is transport output, not one undifferentiated Tutor
answer. The current runner forwards every delta immediately, concatenates text
across all model steps, and later persists that concatenation as one assistant
item. Live ALS-022 traces have therefore flattened useful tool preambles,
ordinary teaching, and occasional internal Agenda/control narration into the
same final response.

The pinned Codex reference does not solve this with prompt-secret censorship.
It preserves assistant response items and carries an optional
`commentary | final_answer` phase; tool activity remains separate. Commentary
may still be streamed to the user. Known hidden markup receives narrow
host-owned treatment, but arbitrary internal vocabulary is not filtered.

The first 0005 implementation does not add Codex-style phase metadata or split
assistant Session items merely to imitate that reference. Those are generic
presentation mechanisms, while the current product pressure is the
learning-owned conditional purpose. Instead:

- render the operative meaning in natural Tutor language without adding
  concern IDs, precedence labels, or architecture narration to the new
  contribution;
- keep the existing prompt instruction that internal control terms are not
  learner-facing prose; and
- inspect final learner-visible text in deterministic fixtures and one bounded
  provider verification after the semantic implementation is complete.

The current Turn-wide text accumulator remains a known presentation defect,
not an architecture blocker. Preserve response-item/step boundaries only when
the first implementation or a later terminal/TUI consumer shows that prompt
discipline and natural rendering are insufficient. That follow-up must not use
Agenda keywords, presence of a tool call, another model pass, or a second Tutor
runtime as a classifier.

## Continuation, override, and failure

### Non-mutating continuation

A material read does not consume or settle the default. Before the next sample,
composition recompiles. If the same exact concern remains the sole legal
candidate at the same version, the new immutable cut contains the same
contribution. No process-persistent “activity” is required.

### Current-request override

An explicit direct answer, requested representation/form, completed occurrence,
cancellation, or redirection can override the default in the normal realizing
sample. Override:

- does not mutate the concern;
- does not rewrite reason/constraint;
- does not create a learner inference; and
- need not create a separate durable override record for the first slice.

The admitted user item and immutable context cut preserve what the model saw;
the completed response preserves what it did. A separate semantic override
receipt has no demonstrated restart or query consumer yet.

Cancellation still uses the existing dismiss/supersede command when the learner
actually requests a durable Agenda change.

### Completed occurrence

If the current learner input reports and contains a complete response under the
required condition, the normal address capability may settle the concern. The
constraint does not auto-address it and does not prove correctness or external
independence. The current source-bound alignment rationale remains required.

If the learner reports seeing the answer or a decisive hint first, the model
must leave the concern open. It may give feedback or offer a new opportunity.
No new evidence record is implied.

### Failure and crash

Provider failure, interruption, or crash invents no service. The context cut
remains an audit record; Agenda remains open. A later Turn recompiles from
current durable state. No active default needs restart recovery because no
running Turn is resumed.

## Implemented production slice

The first production implementation keeps the predicted ownership boundaries:

- `src/learning/agenda/future-attention.ts` — domain type, create/supersede
  validation, storage/query mapping;
- `src/learning/agenda/future-attention-tool-execution.ts` — parse/bind optional
  create/replacement constraint;
- `src/runtime/agenda-tools.ts` — narrow model-facing input descriptions;
- `src/runtime/tutor-tools.ts` and `src/tutor/policy-profile.ts` — expose the
  new model-facing fields only under `tutor-default-v3`, preserving the frozen
  `tutor-default-v2` provider contract;
- `src/tutor/compile-context.ts` — full legal count and conditional contribution;
- `src/tutor/render-system-prompt.ts` — operative rendering and candidate
  distinction;
- storage migration/schema code — nullable constrained column with no backfill;
  and
- focused Agenda/context/runtime tests, including final learner-visible output
  fixtures.

Schema version 5 adds one nullable checked column and performs no text-derived
backfill. The implementation adds no generic policy module, manager, service,
constraint registry, selector call, or durable activity.

## Required counterexamples and verification

1. one eligible constrained concern + generic continuation -> conditional
   contribution present;
2. same concern + direct answer -> current request wins, concern remains open;
3. same concern + requested direct comparison -> no forced quiz, concern open;
4. same concern + completed unaided occurrence -> address only, no mastery;
5. same concern + guided occurrence -> remains open;
6. one upcoming or superseded concern -> no conditional contribution;
7. two legal eligible concerns -> no automatic default;
8. one matching legacy/null-constraint concern -> no automatic default;
9. material read -> next cut retains exact source/version/constraint;
10. correction/supersession -> old contribution disappears, successor meaning
    appears only when legal;
11. provider failure/interruption -> no address/service;
12. replay with changed constraint -> semantic conflict;
13. terminal learner-facing response -> natural reminder is allowed but concern
    ID, precedence, and control reasoning are absent in provider-qualified
    behavior fixtures;
14. unrelated explanation -> no new concern, constraint, activity, or evidence.

The domain, migration, tool, context, and runtime suites cover the structural
cases above, including exact untruncated candidate count, null legacy rows,
two-candidate ambiguity, supersession, replay conflict, policy-version gating,
fresh-Session recovery, a tool-read continuation, and exact-current-request
override. Existing Agenda transition and runner failure contracts continue to
own service/disposition and failure truth rather than this projection.

One bounded live `deepseek-v4-flash` production run on 2026-07-13 used a fresh
Session containing only `继续。`. It asked for the learner's prediction before
analysis in one model step, disclosed no answer, and narrated no Agenda,
precedence, concern ID, or control rule. This qualifies the natural rendering
once; it does not prove wording reliability across providers or domains. See
[`../research/proposal-0005-production-verification-2026-07-13.md`](../research/proposal-0005-production-verification-2026-07-13.md).

## Rejected expansions

- parsing arbitrary `reason` prose into control rules at return time;
- a stringly typed constraint registry;
- “independent / guided / review / quiz” mode enums;
- a generic activity or intervention table;
- an unconditional due-item scheduler;
- a selector model or extra provider call;
- treating the tag as proof of independence, correctness, or mastery;
- backfilling old concerns from text; and
- requiring every Agenda concern to carry a learner-role constraint.

## Deferred, non-blocking detail

Whether a later evidence consumer needs a structured assistance claim remains
deferred until that consumer exists. It does not reopen the implemented
ownership, one admitted constraint, promotion policy, priority, scope,
correction, or non-effects.
Response-item/phase representation is deferred until a concrete presentation,
partial-recovery, or TUI consumer makes the current flattened shape inadequate
beyond the bounded provider-output observation already recorded.

## Sources

- [`../decisions/0013-conditional-current-purpose-composition.md`](../decisions/0013-conditional-current-purpose-composition.md)
- [`../research/conditional-current-purpose-result-2026-07-13.md`](../research/conditional-current-purpose-result-2026-07-13.md)
- [`../research/exact-reason-conditional-default-result-2026-07-13.md`](../research/exact-reason-conditional-default-result-2026-07-13.md)
- [`../research/teach-adapt-return-architecture-proof-2026-07-12.md`](../research/teach-adapt-return-architecture-proof-2026-07-12.md)
