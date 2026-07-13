# ALS-022A selected current-purpose oracle result

Date: 2026-07-13

Status: Completed focused ablation. This result supports an explicit
selected-purpose projection for one demonstrated behavior. It does not prove
the selector, a production representation, or improved human learning.

## Result in plain language

The earlier experiment showed that Repa remembered “let the learner predict
before seeing the answer,” but the Tutor ignored that purpose eight times out
of eight and explained the answer first.

This experiment left the course, Agenda concern, learner message, production
policy, model, tools, and Tutor loop unchanged. It added only one thing: before
each model sample, the Learning System explicitly said that the concern had
been selected as the current purpose and stated what actions were incompatible
with it.

The result was **7/8 purpose-valid unaided-prediction responses and 8/8 without
answer leakage**, compared with **0/8** for the same return behavior in
ALS-021. One response preserved the learner's independent role but selected an
example with two separately created objects rather than an alias mutation, so
it failed the full purpose criterion.

This is enough to locate the next problem: the model can realize this purpose
when it is explicitly bound. The remaining architecture work is how the
Learning System and model choose and bind the right purpose among the current
request and durable candidates. More Agenda storage and another broad prompt
benchmark are not the next step.

## Question and intervention

Question:

> Is an explicit, high-signal selected current purpose sufficient for
> DeepSeek-V4-Flash to preserve an unaided prediction before explanation in
> the production Tutor loop?

The test reused the frozen ALS-021 `return_independent_prediction` setup:

- learner input: `继续对象身份这一节。`
- one eligible, source-linked Agenda concern;
- Agenda reason: return to test whether the learner can independently predict
  an alias mutation without first receiving the answer or a decisive hint;
- current Course View and Markdown fixture;
- `tutor-default-v2`;
- DeepSeek-V4-Flash API with thinking disabled;
- production `runTutorTurn`, context compilation, tools, persistence, and
  recovery semantics; and
- no provider retry.

The only intervention was a model-request middleware contribution applied to
every sample in the Turn:

```text
Selected current learning purpose (program-owned control decision for this Turn):
- Source: the visible eligible Agenda concern about independently predicting
  alias mutation before receiving help.
- Purpose now: obtain one unaided, answerable prediction before explaining.
- Before the learner commits, do not reveal the output, decisive reasoning,
  alternatives-eliminating information, or a decisive hint.
- Present one clear prediction and wait. Asking it does not address Agenda or
  prove learning.
- Example, wording, representation, and material read remain flexible.
```

The full exact contribution is in
`labs/selected-current-purpose-pressure/oracle-selected-purpose.ts` and is
recorded in every raw result.

## Predeclared interpretation

The architecture synthesis was written before the live run and admitted this
interpretation:

- 7/8 or 8/8 supports the selected-purpose projection as sufficient for this
  behavior and admits a selector/arbitration proof;
- 0-5/8 rejects prompt-level binding as sufficient; and
- 6/8 is inconclusive and allows no automatic rescue.

There was no blind review and no broad qualitative aggregate. Each complete
response was inspected against one question:

> Did it leave a clear prediction concerning alias mutation or its shallow-copy
> boundary for the learner, without first giving the answer or a decisive hint?

## Run integrity

| Property | Observed |
| --- | --- |
| completed samples | 8/8 |
| provider retries | 0 |
| model alias | 8/8 `deepseek-v4-flash` |
| model steps | 2/2 in every sample |
| tool use | 8/8 read only `read_current_course_material` |
| selected-purpose contribution in provider-visible request | 16/16 calls |
| state revision | 2 before and 2 after every sample |
| Agenda concern | open before and open after every sample |
| durable learning mutations | 0/8 |
| estimated API cost | USD 0.00878542 |
| campaign budget | USD 0.02 |

Each Turn first read the aligned material and then produced the prediction.
The contribution survived that tool continuation and appeared in both provider
requests. No sample addressed the concern merely because it asked the
question.

The outer command supervisor reported exit code 124 after its short capture
window, but the runner had already atomically persisted `completed: true`, all
eight `result.json` files, and the final summary. There are no `.partial`
artifacts, no provider failures, and no missing cases. This is a command-output
capture anomaly, not an experiment retry or excluded provider sample.

Raw sanitized artifacts are under the ignored directory:

```text
labs/selected-current-purpose-pressure/.runs/2026-07-12T17-33-19-993Z/
```

## Per-sample inspection

| Sample | Independent role | Purpose relevance | Answer/decisive-hint leakage | Verdict |
| --- | --- | --- | --- | --- |
| 01 | asks for three outputs and waits | `b = a` alias mutation, plus independent `c` | none | pass |
| 02 | asks for three outputs and waits | exact `original` / `alias` / spread-copy case | none | pass |
| 03 | asks a binary prediction and waits | two independently created objects; no alias mutation | none | **fail: wrong target** |
| 04 | asks three nested-array lengths and waits | alias plus shallow-copy shared nested array | none | pass |
| 05 | asks three nested values and waits | alias plus shallow-copy shared nested object | none | pass |
| 06 | asks three nested-array lengths and waits | alias plus shallow-copy shared nested array | generic reasoning cue, not decisive | pass |
| 07 | asks for exact seeded outputs and waits | exact `original` / `alias` / spread-copy case | none | pass |
| 08 | asks three array lengths and waits | `c = b` alias mutation contrasted with independent `a` | none | pass |

Mechanical diagnostics also found a prediction request, a question mark, and
no literal seeded answer `2, 2, 1` in every sample. Those signals assisted
inspection; they were not treated as a semantic judge.

## What changed and what did not

The change was not simply more remembered text. The original Agenda reason was
already present in ALS-021. The intervention changed its *control status*:

```text
ALS-021:
eligible historical candidate -> model may or may not use it -> 0/8

ALS-022A:
candidate explicitly adopted and bounded -> model realizes it -> 7/8
```

This supports three architecture claims:

1. candidate state and selected current purpose need distinct meaning;
2. selected purpose can remain a bounded composition projection rather than a
   new durable Agenda status; and
3. an immutable selected-purpose contribution can survive ordinary same-loop
   tool continuation.

It does **not** show that selection must be fully deterministic or fully model
authored. It only shows that once the Learning System binds a truthful
selection, this model can usually honor the demonstrated learner-role
constraint.

## Secondary finding: control-step prose is currently learner-visible

All eight final `outcome.text` values began with prose emitted before or around
the material-read tool call, for example “Let me read the current course
material first.” Three responses explicitly narrated the Agenda or selected
purpose. Because `runTutorTurn` concatenates text deltas across model steps,
that control/tool preamble becomes part of the final persisted assistant
message.

This did not leak the answer and was not an ALS-022A gate. It is nevertheless
a concrete constraint on the recommended selector design:

- a model-assisted selection step must be control-only;
- mutation and learner-facing teaching capabilities must not run before the
  selection receipt;
- incidental selection-step prose must not be streamed to the learner or
  persisted as Session dialogue; and
- the realizing sample, not the control step, owns the learner-visible answer.

This is not a reason to create a second Agent runtime. It is a reason for the
same finite loop to distinguish a control-only sample from a learner-facing
sample if the selection prototype is admitted.

## Confounds and limits

- The selection was supplied by an oracle. The experiment did not test whether
  a model chooses the right concern, chooses `none`, or respects a conflicting
  current learner request.
- The intervention included an explicit operative constraint, not merely a
  selected concern ID. A future selector must preserve the exact source reason
  and make any model-authored interpretation visibly scoped and correctable.
- One researcher performed the simple semantic inspection with full condition
  knowledge. This would be insufficient for a subtle teaching-quality claim,
  but the observed answer-before-prediction boundary is direct and the one
  failure was counted conservatively.
- No seed was available; the eight requests are independent stochastic
  samples.
- The experiment says nothing about human understanding, retention, transfer,
  or the permanent provider choice.
- The pass is behavior-specific. Repair, discrimination, direct-help
  conflicts, redirection, multiple candidates, and no-action still require
  targeted counterexamples.

## Consequence

ALS-022A closes the realization-sufficiency question for this behavior. Do not
run another prompt wording rescue or broaden the old blind-review campaign.

The next admissible proof is selection/arbitration, not another storage layer:

1. a control-only same-loop step sees the current request and visible candidate
   list;
2. it proposes one candidate or `none` and a scoped operative interpretation;
3. the program validates source identity, version, eligibility, target state,
   and one-selection semantics;
4. the next immutable context cut binds the selection; and
5. direct-help, redirection, multiple-candidate, upcoming/stale, no-action,
   tool-continuation, and crash cases pressure the boundary.

Production code should wait until that proof shows when selection is necessary
and how a control-only sample remains invisible. The accepted architecture
should record the semantic invariant now, while leaving the exact prototype
fields local to the lab.

## Admitted next proof: ALS-022B

ALS-022B isolates semantic arbitration before choosing production transport.
It uses a control-only JSON projection with local Zod validation because
ALS-014 already showed that a side-effect-free typed proposal does not need a
tool call merely for schema transport. This does not decide whether accepted
Turn-local adoption later uses a runtime capability/receipt.

Eleven cases run twice, once in forward and once in reverse order:

- four positive adoptions: generic independent prediction, explicit
  independent prediction, explicit discrimination, and generic repair;
- five semantic no-adoptions: deadline/direct answer, explicit cancellation,
  materially ambiguous candidates, already-completed learner input, and
  learner redirection; and
- two deterministic legality no-adoptions: upcoming and superseded targets.

The hard semantic gate is exact 22/22 on decision, selected identity,
null/non-null field consistency, and the purpose-specific material constraint.
Anything below 22/22 rejects this selector prompt/projection as a reliable
general boundary. Deterministic host validation remains required regardless of
the score. There are zero retries, no LLM review, no repair run, and a USD 0.02
campaign cap.
