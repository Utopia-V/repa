# Learning-native B2 Trace 1

Date: 2026-07-11

Status: Locally accepted Phase B2 integration result after checker replay and
qualitative review. The raw bundle is Git-ignored and this is not a frozen,
checkout-reproducible benchmark artifact. It is not evidence of retention,
human learning outcomes, or superiority over a general Agent.

## Question

Can the existing generic model/tool loop carry a real teaching interaction
while the experimental learning layer supplies course position, keeps the
learner's steering effective, records only that an explanation occurred, and
recovers that meaning after a fresh reopen?

## Setup

- Tutor: DeepSeek-V4-Pro API with `thinking=max`.
- Generic loop: Vercel AI SDK `generateText`, automatic tool continuation, and
  a four-step limit per Tutor turn.
- Learning layer: the file-backed B1 SQLite lab.
- Material: the Objects introduction and literals section from
  `javascript.info`, pinned at Git commit
  `52c1e61915bc8970a950a3f59bd845827e49b4bf`.
- Initial request: begin the Objects section with 45 minutes available, give a
  short route orientation, teach the first useful content, and do not
  automatically quiz.
- Second learner message: selected only from the visible first reply. It asks
  for a smaller student-information example limited to object literals and
  reading and changing properties.

The model saw no mastery, hidden learner truth, expected next action, or
hand-written ideal summary. The only model-facing tool was the bounded material
read. The runtime, rather than the model, recorded `explained` after the
selected explanation completed normally.

## Frozen checks

The trace separated four questions.

1. **Mechanics:** the Tutor reads the pinned material, both turns stop normally,
   and the complete AI SDK assistant/tool messages are retained in the local
   raw run.
2. **Teaching:** the first reply gives a useful orientation and correct example
   without an automatic quiz; the second reply responds to the learner's
   narrower request.
3. **Durable meaning:** exactly one active `Objects: explained` fact points to
   the actual first assistant item. No `followed`, attempt, revisit, or ability
   claim is created.
4. **Recovery:** after closing and reopening SQLite, the two user-visible Tutor
   replies, the learner steering message, the course position, and the compact
   `explained` progress remain available.

`explained` answers only whether the selected teaching action occurred. It does
not certify correctness, usefulness, or learning.

## Runs and oracle correction

Three local raw runs were preserved under the Git-ignored `.runs/` directory.

| Run | Purpose | Time | Estimated upper-bound cost | Result |
|---|---:|---:|---:|---|
| `2026-07-11T11-53-11.147Z-learning-native-b2-first-trace-smoke-deepseek-v4-pro.json` | one-turn transport smoke | 21.718 s | $0.00187114 | mechanics passed; qualitative review found an absolute claim that ignored Symbol property keys and teaching beyond the bounded excerpt |
| `2026-07-11T12-02-29.075Z-learning-native-b2-trace-1-deepseek-v4-pro.json` | first two-turn trace | 22.498 s | $0.00301084 | mechanics passed; the second turn narrowed correctly but still added deletion after the learner requested a smaller scope |
| `2026-07-11T12-04-18.545Z-learning-native-b2-trace-1-deepseek-v4-pro.json` | revised steering policy | 22.787 s | $0.00269390 | final trace; raw checker rejected one note about assignment to a missing property, then the checker was narrowed and replayed offline |

The final oracle correction happened after inspecting the raw output, so it is
recorded rather than hidden. The first checker treated any mention of adding a
property as an unrelated operation. That was too strict: assigning through the
same syntax is the direct semantics of the requested modification operation.
The corrected checker still rejects deletion, square-bracket access, references,
copying, a new quiz, or a response that does not become narrower. The final raw
trace replays with no deterministic failures under that rule.

This correction is allowed in Phase B2 because B2 is integration work. Phase C
must freeze the learner policy and every oracle before any comparison run.

## Final qualitative review

The first reply correctly located Objects before references/copying and methods,
then taught object literals and dot-property access with valid code. It was
broader than necessary, which supplied a real reason for learner steering. It
did not quiz or claim mastery.

The second reply immediately switched to a student-information example, became
substantially shorter, and stayed with object literals, reading, and assignment.
It did not repeat the course route, enter references/copying, or ask a question.
Its one sentence noting that assignment to an absent property creates that
property was accepted as a direct semantic caveat rather than a new lesson.

The first reply said the learner "should already have encountered" primitive
types. The material does refer back to the types chapter, but the learning
state did not establish that the learner completed it. This did not create a
durable false fact, but it is a useful policy warning: route prerequisites and
learner history should not be phrased as the same thing.

## What the trace establishes

- The project does not need a learning-specific provider loop. The shared AI
  SDK message/tool continuation works for this teaching trace.
- Learning remains first-class because course position is assembled before the
  call, the selected activity controls the default action, and the completed
  action creates a source-linked learning fact that survives a new Session.
- A full explanation can stay in raw Session history while routine context
  carries only `explained`.
- Learner steering can alter the next Tutor action without switching runtimes or
  introducing a workflow engine.
- Reading material does not by itself guarantee factual precision or scope
  discipline. Teaching quality remains a separate review surface; it should not
  be encoded as a mastery field or inferred from `explained`.

## What remains open

Trace 1 does not show that the learner understood or retained the content. It
does not exercise demonstration versus learner performance, self-study,
practice and a local revisit, a deadline, or continuation several days later.

The next B2 trace is operation before principle. It should reuse the same loop
and distinguish only what actually happened: `demonstrated`, `followed`, and
`explained`. No mastery scale or new learning architecture is justified by
Trace 1.
