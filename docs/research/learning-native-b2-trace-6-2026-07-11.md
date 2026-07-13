# Learning-native B2 Trace 6

Date: 2026-07-11

Status: Locally accepted Phase B2 integration result after checker replay. The
raw bundle is Git-ignored and this is not a frozen, checkout-reproducible
benchmark artifact.

## Question

After a real close/reopen and a several-day virtual time jump, can a new
Session containing only `继续` recover a useful next learning action without
asking the learner to restate course history or eagerly loading old detail?

## Prior facts

The setup produced its state through ordinary B1 transitions:

- the Objects section had one source-linked `explained` fact;
- the route had advanced to object cloning;
- an independent object-reference attempt was recorded as incorrect;
- one local revisit linked to that attempt became due; and
- the full old explanation, answer, and feedback remained in their prior
  Session.

The database was then closed and reopened. At virtual time `10000`, the only
new user text was `继续`.

## Checks

1. Routine context contains course position, compact progress, and the due
   revisit, but not the old answer text.
2. The Tutor does not ask which course or where the learner stopped.
3. It selects the due revisit before untouched object-cloning material.
4. Only after selecting that action does it call `read_attempt` for the linked
   old detail.
5. It begins a targeted active-recall prompt without revealing the answer.
6. Merely asking the revisit question does not create a new attempt, progress,
   or completion; the revisit remains due.
7. The new response survives another fresh reopen.

## Run and oracle correction

`2026-07-11T12-39-26.720Z-learning-native-b2-trace-6-deepseek-v4-pro.json`
used two model steps, took 9.606 seconds, and had an estimated upper-bound cost
of $0.00096941.

The raw checker rejected the response because it required the words for
"review" and `b = a` to occur within 30 characters. The response had a short
provenance explanation between them. The checker was corrected to require
three independent semantic facts anywhere in the bounded response: a review
action, the object-reference target, and an unanswered recall prompt. The raw
output then replayed offline with no failures.

Independent review found a second oracle defect: the no-answer check still
looked for the value from an older example (`2`), while this trace asks about
`score: 10 -> 20`, and it did not reject a prose explanation that directly
states the shared-reference rule. The trace now owns one fixed recall exercise;
the prompt renderer and checker read the same exercise definition. Counterexamples
that reveal `20`, state the rule in Chinese, or state it in English are rejected.
The original response still replays cleanly. No second model call was used for
either oracle correction.

## Qualitative review

The Tutor recognized the due review, read the old attempt, restated the exact
misconception, and changed the field name from `value` to `score` in a parallel
question. It asked the learner to predict and explain the output. It did not
give the answer or open object cloning.

The learning revision stayed unchanged and the revisit remained pending,
because the learner had not answered yet.

## What the trace establishes

- Durable learning meaning is not the same as general conversation memory. A
  small current view selected the action before old transcript detail was read.
- Source IDs are useful retrieval paths; they do not require loading every old
  Session into the model context.
- `继续` can be enough when the application owns course position, due work, and
  time-sensitive context.
- Starting a review and completing a review are different transitions. A Tutor
  question alone must not settle the revisit.

## Phase result

All six Phase B2 traces now have bounded live runs. Their combined result is in
`learning-native-b2-six-trace-synthesis-2026-07-11.md`.
