# Learning-native B2 Trace 4

Date: 2026-07-11

Status: Phase B2 integration result. Trace 4 passed. The fixed task has a
deterministic answer; the run does not measure broad programming ability.

## Question

Can one scripted learner-reported result with a deterministic answer remain a
local, source-linked fact, produce useful feedback, and schedule a later
revisit without rewriting the course route or inventing mastery?

## Setup

The scripted learner fixture reported answering this fixed JavaScript task
without a hint:

```js
let a = { value: 1 };
let b = a;
b.value = 2;
console.log(a.value);
```

The answer was `1` with the explanation that `b` is a newly copied object. The
deterministic result is `2`. Before the Tutor call, the runtime records one
`incorrect` attempt whose declared assistance condition is `independent`,
linked to the learner message. This is a scenario fact, not observed human
performance.

The deterministic fixed-task result schedules one local revisit linked to the
attempt before the model responds. The model receives compact course context
and one read-only `read_attempt` tool, and must read the recorded conditions
before feedback. Tutor quality can fail without erasing the already recorded
error or revisit.

## Checks

1. The Tutor reads the exact recorded attempt.
2. Feedback gives output `2` and explains that `b = a` copies a reference to
   the same object.
3. It does not immediately ask another question or infer general ability.
4. The revisit is absent one tick before its due time and present at the exact
   due time.
5. The revisit retains its source attempt and learner-answer item.
6. The course route and current section remain unchanged.
7. No `read`, `explained`, `followed`, or mastery-like progress is invented.

## Runs

| Run | Time | Estimated upper-bound cost | Result |
|---|---:|---:|---|
| `2026-07-11T12-29-44.289Z-learning-native-b2-trace-4-deepseek-v4-pro.json` | 8.449 s | $0.00081101 | feedback passed, but this earlier implementation incorrectly made revisit creation depend on Tutor-quality checks |
| `2026-07-11T12-56-38.597Z-learning-native-b2-trace-4-deepseek-v4-pro.json` | 10.723 s | $0.00091843 | current semantics: the fixed incorrect result created the revisit before Tutor feedback; deterministic and qualitative checks passed |

## Qualitative review

The Tutor traced all four program lines, corrected the new-object misconception,
and contrasted object assignment with primitive-value assignment. It stopped
after feedback. The explanation was correct for the selected task and did not
turn one error into a learner profile.

After a fresh reopen, the scripted attempt remained `incorrect` with declared
assistance `independent`, the routine progress list remained empty, and the due
revisit pointed back to the learner answer and attempt. Tutor feedback quality
was a separate result.

## What the trace establishes

- A scripted performance record can stay lazy: it is not loaded into every
  context, but a Tutor can retrieve it for the current move.
- A local revisit can be derived from a specific, source-linked error without a
  mastery model or route mutation.
- Feedback itself need not create a broad `explained` fact. The raw Session and
  revisit provenance are sufficient for this case.
- Time changes whether an existing revisit matters; it does not manufacture a
  new observation.

## Next step

Trace 5 adds a source-linked virtual assignment deadline and asks whether its
urgency changes the near-term action while leaving learner claims untouched.
