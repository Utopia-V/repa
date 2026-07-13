# Learning-native B2 Trace 2

Date: 2026-07-11

Status: Phase B2 integration result. Trace 2 passed. This trace uses a
responsive scripted learner and does not establish human performance.

## Question

Can one generic Agent loop support a deliberately layered lesson in which the
Tutor first demonstrates an operation, the learner reports following it, and
the Tutor explains the principle only afterward, while the learning layer keeps
those three events distinct?

## Setup

- Tutor: DeepSeek-V4-Pro API with `thinking=max`.
- Material: `javascript.info`, Object methods and `this`, pinned at commit
  `52c1e61915bc8970a950a3f59bd845827e49b4bf`.
- First material window: `Method examples`, ending before `"this" in methods`.
- Second material window: `"this" in methods`, ending before
  `"this" is not bound`.
- First request: demonstrate defining and calling `student.sayHi`; postpone the
  `this` principle and do not quiz.
- Learner policy: report following the operation only if the visible Tutor
  reply contains both a method definition and a call. Then ask why `this.name`
  reads `student.name` in `student.sayHi()`.
- Second request: explain only that receiver principle, without a quiz.

The learning layer records `demonstrated` from the first assistant message,
`followed` from the learner's report, and `explained` from the second assistant
message. These are progress facts, not a mastery scale.

After semantic review, action occurrence was separated from teaching quality:
a visible, normally completed definition-and-call demonstration is recorded
even if the qualitative checker rejects its pedagogy, and a normally completed
principle explanation is recorded independently of its quality score. A bad
Tutor response can fail the trace without deleting what actually happened.

## Checks

1. The first turn reads only the operation material range, demonstrates a
   method definition and call, and does not teach the postponed `this`
   principle.
2. The responsive learner never claims to follow an operation that was not
   visible.
3. The second turn reads the principle range, connects `this.name` to the
   object before the dot in the direct `student.sayHi()` call, and does not
   quiz.
4. A bounded local rule is not promoted into a claim that no later rules or
   exceptions exist.
5. A fresh SQLite reopen retains three separate, source-linked facts in order:
   `demonstrated`, `followed`, and `explained`.
6. No attempt, revisit, or ability claim is created.

## Runs

| Run | Time | Estimated upper-bound cost | Result |
|---|---:|---:|---|
| `2026-07-11T12-15-27.109Z-learning-native-b2-trace-2-deepseek-v4-pro.json` | 41.254 s | $0.00243623 | deterministic checks passed; qualitative review found the closing claim "没有别的额外规则" after a deliberately bounded explanation |
| `2026-07-11T12-16-41.085Z-learning-native-b2-trace-2-deepseek-v4-pro.json` | n/a | unknown | excluded transport failure: certificate verification failed before any recorded model step |
| `2026-07-11T12-17-29.746Z-learning-native-b2-trace-2-deepseek-v4-pro.json` | 32.453 s | $0.00219194 | final trace passed deterministic and qualitative review |

The policy correction was general: a limited explanation may postpone
exceptions, but it must name its current call form and must not claim that no
further rule exists. The later semantic correction changed only the rejected
path; the accepted final run already contained the three recorded actions. No
state or tool schema changed.

## Final qualitative review

The first turn showed both assignment of a function property and method
shorthand, then called `student.sayHi()`. It used only fixed greeting strings
and did not explain `this`. The learner's subsequent report was therefore a
valid response to something actually shown.

The second turn gave a small `this.name` example and walked through the direct
call `student.sayHi()`. It explicitly limited the rule to the
`对象.方法()` form. It did not ask a question or claim learning success.

## What the trace establishes

- Operation and principle can be separate Tutor actions without separate
  runtimes, modes, or a workflow engine.
- `demonstrated`, `followed`, and `explained` name useful differences that later
  behavior can inspect. They still do not imply mastery.
- Trusting a learner's completion report is compatible with keeping it distinct
  from a formal attempt.
- Lazy material windows are enough for this trace; a complete lesson schema is
  unnecessary.
- Simplified teaching needs an explicit scope boundary. That belongs in Tutor
  policy and qualitative review, not in a new learner-state field.

## Next step

Trace 3 tests independent material study. The Tutor should stay available
without forcing a summary or quiz; the learner's later completion report should
create only `read`.
