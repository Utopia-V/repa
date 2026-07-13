# Learning-native B2 Trace 5

Date: 2026-07-11

Status: Locally accepted Phase B2 integration result after checker replay. The
raw bundle is Git-ignored and this is not a frozen, checkout-reproducible
benchmark artifact. The latest live run also corrected the source timestamp;
its remaining evaluator wording defect was repaired by offline replay.

## Question

Can a source-linked virtual low-learning-value assignment deadline change the
next 45 minutes without erasing due learning work or becoming a claim about the
learner?

## Setup

At virtual minute `10000`:

- a required general-education report is due at `10030`;
- the learner reported that it needs 25 minutes and has low learning value;
- an object-reference revisit is already due;
- object-cloning is the current untouched new section; and
- 45 minutes are available.

The compact context contains the assignment, due revisit, course position, and
time budget. The model must use `read_assignment` to retrieve the source-linked
25-minute estimate and low-value description. The virtual current time is
supplied alongside, rather than added to durable learner state.

## Checks

1. The plan protects the report first and reserves its reported 25 minutes.
2. Remaining time returns to the due object-reference revisit.
3. Object-cloning new material is deferred for this short window.
4. The explanation frames this as a temporary deadline trade-off, not an
   ability, personality, or permanent preference.
5. The unresolved assignment remains open before its deadline and becomes
   overdue at the deadline instead of disappearing.
6. The due revisit remains present and no course progress is invented.
7. The actual plan survives a fresh reopen in raw Session history.

## Runs and oracle correction

| Run | Time | Estimated upper-bound cost | Result |
|---|---:|---:|---|
| `2026-07-11T12-33-31.249Z-learning-native-b2-trace-5-deepseek-v4-pro.json` | 21.211 s | $0.00142007 | the plan made the correct trade-off but expanded into a long rationale and reached the 900-token limit; the initial checker also missed `object-cloning: 不开始` because it expected the deferral word first |
| `2026-07-11T12-34-48.301Z-learning-native-b2-trace-5-deepseek-v4-pro.json` | 12.798 s | $0.00108245 | concise final plan; the raw checker still rejected numbered ordering, `min`, and `不展开` wording |
| `2026-07-11T12-57-02.400Z-learning-native-b2-trace-5-deepseek-v4-pro.json` | 13.322 s | $0.00119468 | source time corrected to an absolute virtual deadline; plan was correct, while the raw checker missed `本次不动`; current checker accepts it on local replay |

The checker was corrected to inspect actual task order and accept ordinary time
and deferral wording. It now also rejects a plan that merely mentions the
report first but actually schedules review first. The latest raw output replayed
locally with no failures. Phase C must freeze this checker before comparison
runs.

## Final qualitative review

The final plan was:

1. 0–25 minutes: complete and submit the report before the deadline.
2. 25–45 minutes: return to the due object-reference revisit.
3. Do not open object-cloning in this short window.

It explicitly described the choice as a temporary constraint rather than a
learner trait. The assignment remained unresolved in the experiment, so the
fresh context changed it from `open` to `overdue` at the deadline. The revisit
remained due.

## What the trace establishes

- Deadline state and current time can alter a Tutor action without a scheduler
  score or learner-profile update.
- Learning value and urgency are separate: low value justifies compression,
  while the deadline still requires action.
- The assignment fact can remain durable while a one-off plan stays in raw
  Session history. This trace does not justify a separate plan schema.
- Time-dependent state belongs in context assembly; it is not new evidence.

## Next step

Trace 6 closes and reopens the learning database several days later. A new
Session contains only `继续`; the Tutor must use the compact current view and
retrieve old detail only if the chosen action needs it.
