# DeepSeek global-overview and lazy-context experiment

Date: 2026-07-11

Status: Research observation for ALS-012. This document does not select a
production context schema, retrieval engine, storage format, or task-selection
algorithm.

## Question

A learning agent needs a view of the learner's route and current situation,
but it should not need every detailed record in context before teaching starts.
Can a small global course overview preserve correct task selection while exact
evidence is loaded only when required?

The live comparison used:

- **DeepSeek-V4-Flash (API, non-thinking)**; and
- **DeepSeek-V4-Pro (API, thinking=max)**.

ChatGPT GPT-5.6 Pro (subscription, Extended Pro via the private Pro bridge) was
not consulted for this batch.

## Fixture

The synthetic compiler-construction course had an active route:

```text
regular-language-model
  -> epsilon-closure
  -> subset-construction
  -> lexer-implementation
```

The current `subset-construction` attempt was independently correct. A current
course overview also pointed to an unresolved failed review of its
`epsilon-closure` prerequisite. The fixed selection policy was:

1. repair an unresolved failed prerequisite on the active route;
2. otherwise verify an assisted or not-yet-delayed current success; and
3. otherwise advance.

The correct action was therefore `repair_prerequisite` for
`epsilon-closure`, supported by the stable item reference
`session-item:review:epsilon-closure:failed-v2`.

The complete state contained 760 lines and 87,109 characters, including an
archived distractor that recommended advancing. The compact overview contained
652 characters and references to the active attempt and blocker rather than
their full bodies.

The executable fixture is
`labs/deepseek-learning-loop/context-stratification.ts`. Full sanitized model
traces remain in the local Git-ignored `.runs/` directory.

## Compared context shapes

### Full state

The initial prompt contained only the question. The model called one tool that
returned the complete versioned learning state, then proposed an action.

### Overview first

The compact current overview was present in the initial prompt. The model could
read exact referenced items and then propose an action.

### Local first, overview lazy

Only the current local attempt was initially present. The model had to call
`read_course_overview`, then read any blocking item exposed by that overview,
then propose an action.

All three variants used the same ordinary AI SDK tool loop. No custom context
runtime, separate agent, or durable learning write was introduced.

## Two different correctness questions

The lab deliberately reports two judgments instead of collapsing them:

1. **Action choice** — did the model choose `repair_prerequisite`?
2. **Evidence-complete proposal** — did it also provide the exact target and
   blocker reference after the reads required by that variant?

This distinction matters. A correct routine next action can still have an
incomplete explanation trail, but that does not make the pedagogical action
itself wrong.

An initial DeepSeek-V4-Flash smoke oracle also required the already supplied
overview reference to be repeated inside `evidenceRefs`. The model cited the
exact blocker and chose the correct action, so that requirement was removed:
overview consumption was already checked independently. The original raw trace
was retained rather than rewritten.

## Repeated result

Across both models and all variants, all 18 trials chose the correct coarse
action. Seventeen of 18 also satisfied the stricter evidence-complete oracle.

### DeepSeek-V4-Flash

| Context shape | Action correct | Evidence-complete | Mean returned chars | Mean model steps | Mean input tokens | Mean elapsed | Mean estimated upper-bound cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| full state | 3/3 | 3/3 | 88,036 | 3 | 41,115 | 7,106 ms | $0.00215481 |
| overview first | 3/3 | 3/3 | 332 | 3 | 3,097 | 4,853 ms | $0.00021241 |
| local first, overview lazy | 3/3 | 3/3 | 920 | 4 | 4,579 | 6,550 ms | $0.00030103 |

### DeepSeek-V4-Pro

| Context shape | Action correct | Evidence-complete | Mean returned chars | Mean model steps | Mean input tokens | Mean elapsed | Mean estimated upper-bound cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| full state | 3/3 | 3/3 | 88,036 | 3.33 | 49,072 | 20,541 ms | $0.01024099 |
| overview first | 3/3 | 3/3 | 268 | 3 | 3,529 | 11,186 ms | $0.00080005 |
| local first, overview lazy | 3/3 | 2/3 | 894 | 3.67 | 5,288 | 15,799 ms | $0.00135553 |

The overview-first path reduced cumulative input tokens by about 13.3 times
for DeepSeek-V4-Flash and 13.9 times for DeepSeek-V4-Pro relative to returning
the full state. Returned tool-result characters fell by more than 260 times.
Provider caching affected cost, but it does not explain the large difference
in model-facing context load.

The local-first path needed one additional model step because the overview was
itself a tool result. It also used more input than placing the small overview
up front.

## The one strict failure

In DeepSeek-V4-Pro local-first trial 3, the model called
`read_course_overview` and speculatively read the already-known current attempt
in the same step. Once the overview revealed the blocker reference, it chose
`repair_prerequisite` correctly but did not fetch the exact blocker item. It
also put explanatory text after `epsilon-closure` in the free-form `target`
field.

This trial therefore has two readings:

- the learning action was correct; and
- the structured evidence-bearing proposal was incomplete.

It is not evidence that DeepSeek-V4-Pro made a worse pedagogical decision. It
does expose two generic engineering points: a model cannot use a reference it
has not seen when issuing concurrent reads, and identifiers that must be exact
should not use an unconstrained free-form string schema.

Whether a routine, reversible next-action proposal must reread the underlying
item is still a product-policy question. A trusted, current derived overview
may be sufficient for that action. Exact evidence becomes more important when
the system changes durable learner meaning, explains a contested inference, or
must survive source revision. ALS-012 therefore keeps the two scores separate.

## Interpretation

### Supported observations

1. A compact global overview plus bounded detail reads preserved the tested
   task choice while greatly reducing context load.
2. Supplying the small overview up front was cheaper and at least as reliable
   as starting from one local item and discovering the overview later.
3. A global view need not contain every lesson detail. It can carry route,
   current goal, active target, and references to possible blockers.
4. The overview is not new learning evidence. It is a current projection that
   points back to observed items.
5. Existing tool-loop mechanics were sufficient; the finding does not justify
   a custom context engine.

### Unsupported claims

This batch does not establish that:

- 652 characters is a universal overview size;
- one static overview should be injected into every conversation turn;
- all disciplines have the same route representation;
- exact-item reads are mandatory for every reversible scheduling choice;
- the overview can replace source material for teaching explanations;
- synthetic distractor accuracy predicts real course-workspace retrieval; or
- either DeepSeek model has better teaching quality.

## Reduction boundary after ALS-012

The smallest current context hypothesis is:

```text
small current course/learner overview
  + current interaction
  + lazy exact reads by stable reference
```

This refines rather than contradicts lazy loading. The global overview is the
map; detailed attempts, reviews, notes, and materials remain lazy. What belongs
on the map and when it must be refreshed remain open. No production schema
should be frozen from this one synthetic route.
