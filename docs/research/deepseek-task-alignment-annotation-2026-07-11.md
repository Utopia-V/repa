# DeepSeek task-to-target alignment annotation experiment

Date: 2026-07-11

Status: Research observation for ALS-013. This document does not admit model
annotations as learner evidence or accepted curriculum relations, and it does
not select a permanent annotation model or schema.

## Question

Can a relatively cheap model add useful semantic signal over a lexical
heuristic when proposing how short learning artifacts relate to curriculum
skills?

The live comparison used:

- **DeepSeek-V4-Flash (API, non-thinking)**; and
- **DeepSeek-V4-Pro (API, thinking=max)**.

The experiment design was independently criticized first by **ChatGPT GPT-5.6
Pro (subscription, Extended Pro via the private Pro bridge)**. Its review is in
`chatgpt-pro-alignment-benchmark-review-2026-07-11.md`.

## Boundary being tested

The output is an annotation hypothesis about a task artifact. It is not:

- an observation about learner performance;
- evidence of learner ability;
- permission to change a course route;
- an accepted prerequisite relation; or
- a durable learning-state write.

The model received a small vocabulary of eight deliberately confusable CS
skills:

```text
recursion / iteration
testing / debugging
complexity-analysis / benchmarking
data-modeling / serialization
```

For every source-referenced artifact it could emit:

- `teaches` — the activity explicitly instructs or demonstrates the skill;
- `assesses` — the scoring rule directly rewards or penalizes the skill;
- `requires` — completion necessarily uses the skill but the rubric does not
  assess it directly;
- `none` — listed terms are incidental or optional; or
- `ambiguous` — the source cannot support one unique annotation.

`none` and `ambiguous` require an empty alignment list. The executor only
recorded candidates for the experiment.

## Adversarial benchmark

Forty short synthetic artifacts were divided into four equal groups:

1. obvious alignments;
2. semantic alignments without direct skill-name overlap;
3. keyword traps, filenames, homonyms, optional approaches, and mechanical
   copying; and
4. records whose activity or rubric was genuinely under-specified.

The deterministic lexical baseline looked for skill aliases and nearby
teaching, scoring, requirement, or ambiguity words. It was intentionally
transparent rather than learned.

| Baseline metric | Result |
|---|---:|
| exact-record accuracy | 0.4500 |
| edge precision | 0.4545 |
| edge recall | 0.4545 |
| edge F1 | 0.4545 |
| semantic-hidden edge recall | 0.0000 |
| empty keyword-trap false-positive rate | 0.8889 |
| ambiguous-status recall | 0.7273 |

Before live repetition, the candidate-signal falsifier was fixed as:

```text
post-repair transport valid
AND exact-record accuracy >= lexical baseline + 0.20
AND semantic-hidden edge recall >= 0.80
AND keyword-trap false-positive rate <= 0.20
AND ambiguous-status recall >= 0.60
```

Passing this threshold means only that the model supplied useful incremental
signal on this lab. It is not a product acceptance criterion.

The executable fixtures are:

- `labs/deepseek-learning-loop/alignment-benchmark.ts`; and
- `labs/deepseek-learning-loop/alignment-annotation.ts`.

Full traces remain in the local Git-ignored `.runs/` directory.

## Pilot corrections excluded from final statistics

Several pilot failures improved the experiment rather than the model score:

1. A 240-character `basis` limit rejected otherwise valid DeepSeek-V4-Flash
   calls. It protected no invariant and was relaxed to 600 characters.
2. DeepSeek-V4-Pro thinking mode rejected forced `tool_choice`. Both models
   therefore used `toolChoice:auto`, with the instruction to submit exactly
   once; actual tool submission remained a transport metric.
3. Two hidden-positive records blurred `assesses` and `requires`. Their rubrics
   were rewritten to state exactly what was scored.
4. A task permitting either recursion or iteration revealed that the flat edge
   vocabulary could not express a disjunctive requirement. Its oracle became
   `ambiguous` instead of pretending neither concept was relevant.

All pilot traces were retained locally. Only repetitions after these changes
are reported below.

## DeepSeek-V4-Flash result

DeepSeek-V4-Flash passed the predeclared candidate-signal threshold in all
three final trials. Every trial produced forty source-linked annotations
without repair.

| Metric | Three-trial mean |
|---|---:|
| raw transport-valid trials | 3/3 |
| repaired transport-valid trials | 3/3 |
| exact-record accuracy | 0.9750 |
| edge precision | 0.9167 |
| edge recall | 1.0000 |
| edge F1 | 0.9565 |
| semantic-hidden edge recall | 1.0000 |
| empty keyword-trap false-positive rate | 0.1111 |
| ambiguous-status recall | 0.9091 |
| high-confidence errors | 1.0 |
| input tokens per forty-record trial | 6,350 |
| output tokens per trial | 5,365 |
| elapsed per trial | 48,966 ms |
| estimated upper-bound cost per trial | $0.00161300 |

The same single record was wrong in every trial: a task required choosing
either recursion or iteration. The oracle marked this `ambiguous` because the
flat schema cannot say "one of these edges." DeepSeek-V4-Flash instead emitted
both edges as if both were simultaneously required or assessed, always with
high confidence.

This is simultaneously a model/calibration error and a representation warning.
Self-reported confidence would not have routed this case to review.

The final DeepSeek-V4-Flash trace is
`2026-07-11T03-31-10.459Z-model-assisted-task-alignment-deepseek-v4-flash.json`.

## DeepSeek-V4-Pro result

Four final DeepSeek-V4-Pro trial groups were attempted. One group lost two of
four batches to an unknown certificate verification error and a provider
response-processing failure; it was retained but excluded from semantic means.
The other three complete groups were:

- main repeated-run trials 2 and 3; and
- one replacement trial run after the infrastructure failure.

All three complete groups produced a perfect semantic score after at most the
bounded generic transport repair.

| Metric | Three complete trials |
|---|---:|
| raw transport-valid trials | 1/3 |
| repaired transport-valid trials | 3/3 |
| exact-record accuracy | 1.0000 |
| edge precision / recall / F1 | 1.0000 / 1.0000 / 1.0000 |
| semantic-hidden edge recall | 1.0000 |
| empty keyword-trap false-positive rate | 0.0000 |
| ambiguous-status recall | 1.0000 |
| high-confidence errors | 0 |
| input tokens per forty-record trial | 6,666 |
| output tokens per trial | 10,506 |
| reasoning tokens per trial | 6,829 |
| elapsed per trial | 158,137 ms |
| estimated upper-bound cost per trial | $0.00927884 |

In two complete trials, the keyword-trap tool JSON ended with one extra `}`.
AI SDK surfaced the invalid call without executing it. A deterministic repair
removed exactly one trailing closer, required the remainder to parse as JSON,
and then allowed normal schema validation. No semantic field was edited.

Across all sixteen attempted DeepSeek-V4-Pro batches:

- twelve were raw-valid;
- two were recovered by that bounded repair; and
- two failed at provider/TLS infrastructure before producing annotations.

The main and replacement traces are:

- `2026-07-11T03-39-16.656Z-model-assisted-task-alignment-deepseek-v4-pro.json`;
  and
- `2026-07-11T03-43-55.563Z-model-assisted-task-alignment-deepseek-v4-pro.json`.

## Interpretation

### What the experiment supports

1. DeepSeek-V4-Flash supplied substantial candidate-annotation signal beyond
   the lexical baseline on this short, controlled CS vocabulary.
2. DeepSeek-V4-Pro resolved the one disjunctive ambiguity that DeepSeek-V4-Flash
   consistently mishandled.
3. DeepSeek-V4-Pro was about 3.2 times slower and 5.8 times more expensive per
   complete forty-record trial in this sample, while also producing less
   reliable raw tool JSON.
4. A typed tool and deterministic validation kept transport failures separate
   from semantic scoring. A bounded syntax repair can recover a candidate
   without silently repairing its educational meaning.
5. The main remaining failure points to a missing representation for
   alternatives or conditional alignment, not simply a need for a larger model.

### What the experiment does not support

It does not show that:

- model candidates reduce human review time;
- synthetic English CS tasks represent real syllabi, assignments, PDFs, or
  multilingual course material;
- DeepSeek-V4-Flash can safely create accepted curriculum relations;
- DeepSeek-V4-Pro should review every candidate;
- high model confidence is calibrated; or
- task alignment alone is enough to infer learner state.

## Reduction boundary after ALS-013

No annotation framework or automatic stronger-model router is justified. The
narrow current hypothesis is:

```text
source-referenced task/rubric
  -> cheap-model candidate alignment
  -> deterministic vocabulary/schema checks
  -> inspectable, correctable artifact hypothesis
```

Such a candidate may help search, organize an import draft, or focus later
review. It cannot itself become learner evidence or silently alter accepted
curricular structure. A stronger-model call should be motivated by an observed
ambiguity or representation gap, not by the mere existence of a larger model.

The next meaningful falsifier would use messy real course artifacts and measure
human corrections or downstream retrieval value. Before that, the alignment
representation must decide how to express optional, disjunctive, and
conditional skill use without turning one task into several falsely mandatory
edges.
