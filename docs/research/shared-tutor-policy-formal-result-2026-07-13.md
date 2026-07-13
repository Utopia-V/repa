# ALS-021 formal campaign result

Date: 2026-07-13
Status: campaign complete; v1 acceptance cannot pass; no adjudicated formal
verdict was generated

## Result in ordinary language

The production Tutor can react usefully when the learner's current message
states the situation directly. It did much less reliably when the Learning
System merely supplied an eligible cross-Session Agenda reason and expected the
model to recover the intended learning purpose.

The clearest failure was the independent-prediction return. The durable reason
said to let the learner predict without first receiving the answer or a
decisive hint. In all eight samples the concern was present in the fresh
Session, but the Tutor explained the mechanism and disclosed the worked result
before offering a prediction opportunity. Both blind reviewers gave this
condition zero primary passes.

In plain terms: the memory survived, but it did not reliably govern the next
teaching move. Persistence and lazy context are not the missing boundary. The
remaining problem is how the Learning System selects a current learning
purpose and makes it operational for the model, while still leaving the model
free to choose the actual explanation, example, question, or representation.

This result does not justify another runtime, a mode state machine, a universal
pedagogy enum, or a general scheduler. It identifies one narrower architecture
seam that needs design before further behavior is piled onto the prompt.

## Campaign identity and denominator

| Fact | Value |
| --- | --- |
| protocol | `als-021-v1` |
| production policy | `tutor-default-v2` |
| Tutor model | `deepseek-v4-flash`, thinking disabled |
| campaign | `main-als-021-v1-5f1a04c64afa` |
| denominator | 8 blocks x 14 conditions = 112 samples |
| completion | 112/112, all selected `attempt-01`; no infrastructure retry |
| observed estimate | $0.11894344 |
| campaign budget charge | $0.11894344 |
| review-input seal | `2e6ca349957f2d20f2d1615c3bde1ffd0a7d9c72e8b1e9cf8a2c02342e0aca59` |
| review lock | `18531860d50be4c582cb28ac015f2420969eb1f20972b714ad2f39e51b500ab0` |

Reviewer A was an isolated OpenAI GPT-5 Codex subagent; the exact backend build
was not exposed. Reviewer B ran through Claude Code in a directory containing
only the anonymous review inputs. Claude Code reported the actual routed model
as `deepseek-v4-pro[1m]` through DeepSeek, not an Anthropic Claude model. That
invocation graded packets only: it did not edit production code, write tests,
or test the test suite.

The packet, result, mapping, rule, reviewer, and identity bytes were sealed
before disagreements were inspected. This preserves the raw campaign even
though the qualitative aggregation was stopped.

## Mechanical observations

These checks cover tool attempts, durable mutations, material reads, Agenda
disposition, route stability, and terminal runtime state. They do not judge
whether the teaching itself was good.

| Condition | mechanical pass | mutation rule | required material read |
| --- | ---: | ---: | ---: |
| novice worked example | 8/8 | 8/8 | 8/8 |
| capable independent prediction | 6/8 | 8/8 | 6/8 |
| deadline direct help | 8/8 | 8/8 | 8/8 |
| explicit later return | 8/8 | 8/8 | 8/8 |
| failed prose, choose a new representation | 8/8 | 8/8 | 8/8 |
| failed prose, explicit visual control | 6/8 | 8/8 | 6/8 |
| understood prose, extend the boundary | 7/8 | 7/8 | 8/8 |
| return for repair | 8/8 | 8/8 | 8/8 |
| return for independent prediction | 8/8 | 8/8 | 8/8 |
| return for discrimination | 8/8 | 8/8 | 8/8 |
| Agenda-reason ablation (exploratory) | 4/8 | 4/8 | optional |
| return in a currently requested form | 8/8 | 8/8 | 8/8 |
| independent opportunity completed | 8/8 | 8/8 | optional |
| guided attempt disclosed | 8/8 | 8/8 | optional |

The predeclared zero-write mutation gate was 91/96 and required 96/96. The two
required-material conditions shown at 6/8 each also missed their 7/8 gates.
Those objective misses alone make a v1 acceptance result impossible, regardless
of how qualitative disagreements might have been adjudicated.

The assistance-sensitive Agenda lifecycle behaved more coherently: all eight
independent-completed cases closed the concern, while all eight guided cases
kept it open. Explicit future-attention creation also succeeded in all eight
cases. The exploratory reason-ablation arm mutated or addressed a concern in
four of eight cases, showing that an eligible concern plus a generic
"continue" request can be mistaken for a purpose actually served.

## Raw qualitative screen

The table below applies the frozen requirements separately to each reviewer's
unadjudicated ratings. These are diagnostic counts, not final scores.

| Condition | reviewer A | reviewer B |
| --- | ---: | ---: |
| novice worked example | 3/8 | 8/8 |
| capable independent prediction | 6/8 | 7/8 |
| deadline direct help | 8/8 | 8/8 |
| explicit later return | 8/8 | 8/8 |
| failed prose, choose a new representation | 7/8 | 8/8 |
| failed prose, explicit visual control | 8/8 | 8/8 |
| understood prose, extend the boundary | 7/8 | 6/8 |
| return for repair | 5/8 | 8/8 |
| return for independent prediction | 0/8 | 0/8 |
| return for discrimination | 7/8 | 8/8 |
| Agenda-reason ablation (exploratory) | 3/8 | 8/8 |
| return in a currently requested form | 6/8 | 8/8 |
| independent opportunity completed | 2/8 | 7/8 |
| guided attempt disclosed | 5/8 | 6/8 |

Both reviewers passed all eight anonymous history-pair contrasts: current
learner history often changed the visible move in the intended direction. When
the individual component predicates are added, the history result becomes 7/8
for reviewer A and 6/8 for reviewer B, so it remains promising rather than a
formal pass.

For the eight Agenda-purpose triads, reviewer A marked every contrast as fail
and reviewer B marked every contrast unclear. No block has a confirmed Agenda
contrast pass from either reviewer. This agrees with the directly inspectable
independent-prediction failure: merely listing the durable reason as an
eligible concern did not reliably preserve the learner's intended cognitive
role.

## Why aggregation stopped

The locked reviews produced 518 categorical disagreements. Of those, 428
involved one reviewer saying `not_applicable`; the largest clusters were
answer-leakage applicability (80), direct-help applicability (78),
discrimination applicability (88 across pass/fail), representation-change
applicability (88), and boundary-progress applicability (56). There were also
substantive differences, including 30 situation-fit `fail/pass` disagreements
and nine answer-leakage `present/absent` disagreements.

This is evaluator-calibration failure, not ordinary independent noise. Exact
adjudication of 518 fields by the primary architect after seeing the condition
map would create a precise-looking result whose meaning depends mostly on the
adjudicator. It would also be wasted work because objective gates already make
v1 acceptance impossible.

Therefore:

- `review-adjudication.jsonl` was not created;
- `formal-verdict.json` was not created;
- no categorical disagreement is silently resolved; and
- `review-analysis-stop.json` records the stop reason and decisive facts beside
  the locked raw artifacts.

This means there is no adjudicated per-condition truth table. It does not mean
the policy passed or that the campaign is unfinished. The campaign is complete,
and promotion is blocked; only the overly ambitious qualitative score is left
undefined.

## Directly inspectable failures

The independent-prediction condition is decisive without trusting either
reviewer. Across all eight samples the Tutor read the material, supplied the
alias/shallow-copy result and its reasoning, and only then invited the learner
to predict or try another example. The selected durable reason was visible and
explicitly required an opportunity before answer or decisive hint.

Reviewer A also marked nine samples as severe factual errors and ten as
unsupported learning-state claims; reviewer B marked none. The full count is
therefore not treated as settled. At least three severe errors were manually
confirmed in the archived outputs:

- `R009` modifies the aliased object to count 2, then creates a spread copy,
  but draws the new copy with count 1;
- `R098` executes `copy.count += 1`, then reports the copy's count as 1 rather
  than 2; and
- `R101` says shallow copying creates a distinct outer object, then draws
  `first` and `second` as pointing to the same outer object.

One confirmed severe error would already violate the frozen zero-severe-error
gate. Several unsupported-state flags also follow a visible pattern: a single
correct or guided occurrence is described as mastery of the whole mechanism.

## Architecture consequence

ALS-021 preserves the existing ownership split but shows that its current
composition seam is too weak:

```text
durable Agenda reason is present
-> model sees an eligible descriptive concern
-> model chooses a generic continuation
-> stored purpose may not constrain the learner's role
```

The next design problem is not more durable memory. It is an explicit,
inspectable selection between durable state and the current model sample. When
the Learning System decides that a concern should shape the current move, the
composed current view needs to distinguish at least:

- the selected learning purpose and source/target provenance;
- constraints that materially change the learner's role, such as obtaining an
  unaided prediction before revealing the answer;
- what occurrence would count as serving that purpose; and
- what remains flexible for the model to realize.

This may be an ephemeral current-move projection rather than a new durable
aggregate. The program selects and binds the purpose; the model remains the
flexible arm that explains, demonstrates, asks, researches, or changes
representation. The learner's current request and steering still outrank a
mere eligible concern. A later command records a durable transition only when
an actual source-bound purpose was served.

That candidate boundary must be designed against direct help, learner
redirection, multiple eligible concerns, and no-action cases before it is
promoted. ALS-021 does not decide its type names, storage layout, ranking
algorithm, or whether every interaction needs one.

## Evaluation-method consequence

The blind packet step had one legitimate purpose: keep condition labels and
expected answers away from the first judgment. It successfully prevented an
unearned formal verdict when reviewers diverged. The broad twelve-field,
dual-model adjudication protocol did not earn its maintenance cost.

Future model-policy evaluation should keep executable gates and real behavior
traces, then use narrowly calibrated qualitative questions only where they can
change a decision. Pairwise comparisons or one behavior-specific criterion are
preferable to asking two models to apply a large applicability matrix. A hard
gate that already settles promotion is also an exit condition, not an invitation
to add more reviewers.

This correction is consistent with current first-party guidance: OpenAI's
[evaluation best practices](https://platform.openai.com/docs/guides/evaluation-best-practices)
recommend task-specific evaluations, automated scoring where possible, human
calibration, and comparison/classification rather than open-ended grading;
Anthropic's
[evaluation design guidance](https://docs.anthropic.com/en/docs/test-and-evaluate/develop-tests)
likewise recommends measurable task-specific criteria, real edge cases, and
automation where the criterion supports it. Those guidelines are inputs, not
substitutes for repository evidence.

## Claim boundary

This campaign tests one model/policy/material fixture with simulated learner
inputs. It does not measure human learning, retention, transfer, optimal
pedagogy, subject generality, or permanent provider quality. It also does not
show that every cross-Session purpose needs deterministic execution. It shows
that the current prompt-level exposure of durable purpose is not reliable
enough to be the Learning System's only control seam.
