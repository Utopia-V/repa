# Learning-native B2 Trace 3

Date: 2026-07-11

Status: Phase B2 integration result. Trace 3 passed. The completion is a
scripted learner report, not independent evidence of comprehension.

## Question

Can the Tutor accept independent reading as a normal learning action, remain
available without taking over, and later preserve only that the selected range
was read?

## Setup

- Tutor: DeepSeek-V4-Pro API with `thinking=max`.
- Material: the `javascript.info` Object references and copying article pinned
  at commit `52c1e61915bc8970a950a3f59bd845827e49b4bf`.
- Selected range: the article opening through `Comparison by reference`, before
  cloning and merging.
- Learner request: read independently, ask questions only if needed, and avoid
  a forced explanation, summary, or quiz.
- Model-facing tools: none. The current section and exact range were already in
  compact learning context, so loading the material into the model would have
  defeated the lazy-read behavior under test.

After a valid standby response, the scripted learner reports reading the range
and needing no Tutor-led explanation. The runtime records `read` with that user
message as its source.

## Checks

1. The Tutor acknowledges the selected range briefly and remains available.
2. It does not teach, summarize, provide code, demand a recap, or quiz.
3. Only the learner's later completion report creates progress.
4. A fresh SQLite reopen retains exactly one source-linked `read` fact.
5. No `explained`, attempt, revisit, or ability claim is created.

## Runs

| Run | Time | Estimated upper-bound cost | Result |
|---|---:|---:|---|
| `2026-07-11T12-21-25.888Z-learning-native-b2-trace-3-deepseek-v4-pro.json` | n/a | unknown | excluded transport failure: certificate verification failed while validating the pinned fixture, before any model step |
| `2026-07-11T12-22-26.494Z-learning-native-b2-trace-3-deepseek-v4-pro.json` | 5.313 s | $0.00036149 | passed deterministic and qualitative review |

The repeated certificate failure led to one shared lab helper that preserves
TLS verification and retries a pinned material request once. It does not
disable certificate checks or change learning behavior.

## Final qualitative review

The complete Tutor reply was:

> 收到。阅读范围：Object references and copying — 从开头到 Comparison by
> reference（含）。我会保持待命，中途有问题随时问。

It did exactly enough to coordinate the action. The later compact context held
`read`, while the full exchange remained in Session history.

## What the trace establishes

- Independent reading is a peer action, not an incomplete Tutor explanation.
- A section-sized selected range is sufficient for this bounded trace; no
  arbitrary range ontology is yet justified.
- Lazy context can avoid putting material contents into the model context when
  the current action does not need them. The host still downloaded the pinned
  fixture to validate the selected range.
- A learner report can update simple progress without being promoted to
  retention, application, or mastery.

## Next step

Trace 4 introduces a scripted learner-reported practice result with a
deterministic answer, records its declared conditions, and creates one local
revisit from that fixed error.
