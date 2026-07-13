# ALS-022E exact-reason conditional-default result

Date: 2026-07-13

Status: Completed negative representation ablation. Exact Agenda reason plus
conditional-default status is insufficient for the demonstrated
independent-before-disclosure behavior. No further live experiment is admitted
in this phase.

## Result in plain language

ALS-022D succeeded, but its context explicitly repeated the rule “let the
learner answer before giving the answer or a decisive hint.” ALS-022E removed
that repetition. The model still saw the original Agenda reason, which already
said the same thing, and the program marked that exact reason as the current
conditional default.

It was not enough.

The mechanical screen reported 6/8, but strict inspection found only **3/8**
valid independent predictions:

- two responses gave the answer before asking;
- one explained the whole section and only asked whether the learner *wanted*
  a future prediction, without presenting one;
- two stated exactly the alias/shallow-copy rules needed to solve their new
  question before asking it; and
- three actually left the central prediction for the learner without first
  supplying the answer or a decisive hint.

This means selected/default *status* and historical *reason* are distinct from
an operative constraint. For this concern, the Learning System must carry an
explicit learner-role/help-order boundary into the realizing context.

## Frozen intervention

The intervention deliberately contained none of these specific rules:

- independent prediction;
- answer before/after response;
- decisive hint; or
- alias-mutation behavior.

It said only:

- the sole legal eligible concern is the conditional default for a generic
  compatible continuation;
- treat the exact stored reason already in production context as operative;
- preserve ordering/assistance/learner-role conditions expressed there;
- the exact current request remains higher priority; and
- the default is not service, evidence, or mastery.

Eight DeepSeek-V4-Flash non-thinking samples reused the exact production
`return_independent_prediction` setup, Tutor loop, material tools, policy,
Course View, and open Agenda concern. There were no retries or review-model
calls. The predeclared threshold was 7/8 for sufficiency, 0-5/8 for stronger
representation, and 6/8 mechanically inconclusive pending direct inspection.

Executable artifacts:

- `labs/selected-current-purpose-pressure/exact-reason-default.ts`
- `labs/selected-current-purpose-pressure/run-exact-reason-default.ts`

Raw sanitized artifacts:

```text
labs/selected-current-purpose-pressure/.runs/exact-reason-default-2026-07-12T18-06-31-835Z/
```

## Integrity

| Property | Result |
| --- | ---: |
| complete samples | 8/8 |
| provider retries | 0 |
| mechanical prediction/no-literal-answer screen | 6/8 |
| strict purpose-valid independent prediction | **3/8** |
| state mutation | 0/8 |
| concern remained open | 8/8 |
| estimated API cost | USD 0.01043602 |
| campaign cap | USD 0.02 |

## Strict per-sample inspection

| Sample | Verdict | Reason |
| --- | --- | --- |
| 01 | fail | taught exact `2 2 1` and nested-sharing outputs before offering a future prediction |
| 02 | fail | summarized the concepts and asked which direction to take; no concrete prediction was left to answer |
| 03 | pass | posed a nested alias/shallow-copy prediction; decomposition questions required learner decisions but supplied no answers |
| 04 | pass | posed the exact seeded prediction without prior result or decisive rule explanation |
| 05 | fail | stated reference-copy and spread-copy rules immediately before a question whose answer those rules determine |
| 06 | fail | taught exact seeded and nested outputs, then offered another prediction |
| 07 | fail | explicitly taught that shallow copies share nested objects before asking a nested-sharing prediction |
| 08 | pass | quoted the operative historical reason, then asked the exact prediction without supplying the answer |

The mechanical checker intentionally looked only for a prediction phrase and
literal `2 2 1`. It could not detect “no actual question” or a prose hint that
fully determined a different example. The stable verdict therefore uses the
predeclared semantic criterion rather than the mechanical aggregate.

## Architecture consequence

For the demonstrated concern, a conditional purpose contribution needs two
separate pieces:

1. **Exact source reason** — why later attention matters and what target the
   concern is about; and
2. **Operative learner-role constraint** — the action-order boundary that
   makes otherwise reasonable teaching incompatible with the purpose.

The smallest demonstrated constraint is:

```text
learner response serving this concern must occur before Tutor disclosure
of the answer or a decisive hint
```

This is not a pedagogy method, quiz mode, mastery claim, or prescribed example.
It forbids only the action ordering that destroys the intended learner role.
Explanation, example choice, representation, and exact question remain open.

The constraint has cross-Session meaning because it determines both:

- how a later selected/default concern may be realized; and
- why a learner occurrence after prior disclosure does not truthfully serve
  the same concern.

That makes Agenda the likely owner of the durable constraint, with Tutor
composition projecting it as operative when the concern is the conditional
default. The exact storage/type shape remains a contract-design question, not
permission for a universal pedagogy enum.

## Candidate narrow contract

The evidence supports designing one optional, source-bound constraint rather
than parsing the free-text reason on every return:

```text
learnerRoleConstraint.kind = learner_response_before_tutor_disclosure
```

The exact reason continues to say what response/target matters. The kind says
only that the Tutor may not disclose the answer or a decisive hint before the
learner's response. Creation remains model-initiated but domain-validated;
correction/supersession preserves history. Selection renders the constraint as
operative. Addressing still requires a later complete occurrence and explicit
alignment; the tag itself proves neither independence nor correctness.

Before production code, the contract must show:

- creation, replay, correction, and source/version semantics;
- bounded context projection and user-correctable inspection;
- how guided disclosure remains open without claiming machine-verifiable
  independence;
- how learner-request override leaves the concern unchanged; and
- why no generic constraint registry or pedagogy state machine is needed.

## Limits

- Only one learner-role boundary and one course topic were tested.
- The result does not prove a complete set of assistance conditions.
- A typed constraint can preserve and render meaning; it cannot prove from raw
  prose that no outside assistance occurred.
- No human-learning effect was measured.
- Internal Agenda/control narration still appeared in several responses and
  remains a presentation problem separate from semantic representation.

The phase now stops live model experimentation. The next work is a small
reviewable contract for this demonstrated constraint, followed by ordinary
repository verification—not another selector, prompt wording, reviewer, or
provider campaign.
