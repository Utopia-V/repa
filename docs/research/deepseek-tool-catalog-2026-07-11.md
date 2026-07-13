# DeepSeek tool-catalog narrowing experiment

Date: 2026-07-11

Status: Research observation for ALS-006. This document does not approve a
production tool registry, discovery protocol, router model, or code-mode
interface.

## Question

When a learning agent may eventually have many tools, does the project need a
custom agent loop to keep the model-facing tool set small, or can current
generic mechanisms already expose only the tools relevant to the active
learning situation?

The live comparison used:

- **DeepSeek-V4-Flash (API, non-thinking)**; and
- **DeepSeek-V4-Pro (API, thinking=max)**.

ChatGPT GPT-5.6 Pro was not consulted for this batch.

## Setup

The same authoritative formal result was presented under three variants:

1. **Broad catalog** — 37 direct learning tools were visible. One tool recorded
   a formal independent task result; 36 plausible tools represented exposure,
   self-report, notes, review, assignment, mastery, and other nearby actions.
2. **Context narrowed** — the full in-process registry still existed, but AI
   SDK `activeTools` exposed only `record_formal_task_result` to the model.
3. **Lazy discovery** — the first model step exposed only
   `discover_learning_tools`; after its result, `prepareStep` exposed only the
   matched formal-result tool.

Each variant ran three times per model after a one-trial
DeepSeek-V4-Flash smoke run. Every run allowed at most four model steps and
3,000 output tokens. The executor recorded every entered tool, and a trial
passed only when exactly one formal result committed, no distractor executor
ran, and discovery ran exactly when required.

The executable fixture is
`labs/deepseek-learning-loop/tool-catalog.ts`. Sanitized complete traces are in
the local Git-ignored `.runs/` directory.

## Result

All 18 repeated trials passed. Neither model entered a distractor executor in
this strongly anchored task.

| Model | Variant | Passed | Wrong executor entries | Mean model steps | Mean input tokens | Mean elapsed |
|---|---|---:|---:|---:|---:|---:|
| DeepSeek-V4-Flash | broad catalog | 3/3 | 0 | 2 | 9,822 | 2,498 ms |
| DeepSeek-V4-Flash | context narrowed | 3/3 | 0 | 2 | 1,479 | 2,529 ms |
| DeepSeek-V4-Flash | lazy discovery | 3/3 | 0 | 3 | 2,273 | 3,338 ms |
| DeepSeek-V4-Pro | broad catalog | 3/3 | 0 | 2 | 10,144 | 6,463 ms |
| DeepSeek-V4-Pro | context narrowed | 3/3 | 0 | 2 | 1,778 | 6,043 ms |
| DeepSeek-V4-Pro | lazy discovery | 3/3 | 0 | 3 | 2,975 | 9,563 ms |

Relative to deterministic context narrowing, the broad catalog consumed about
6.6 times as many cumulative input tokens for DeepSeek-V4-Flash and 5.7 times
as many for DeepSeek-V4-Pro. Lazy discovery used about 1.5 and 1.7 times as many
input tokens respectively, while adding one model step.

This is a mechanism comparison, not a tool-selection benchmark. The prompt
explicitly named the interaction as a formal independent assessment and made
the correct semantic action unusually clear. Zero wrong selections therefore
does not demonstrate that broad catalogs remain reliable under ambiguous,
adversarial, or long-context learning situations.

## Cache is a separate variable from context load

Repeated identical requests received substantial provider cache reads. That
made the measured billing upper bound for repeated broad-catalog
DeepSeek-V4-Flash calls nearly as low as narrowed calls even though the model
still received far more cumulative input tokens.

The first observed path for each variant showed the uncached difference more
clearly:

| Model | Variant | Uncached input tokens | Estimated upper-bound cost |
|---|---|---:|---:|
| DeepSeek-V4-Flash | broad catalog | 4,830 | USD 0.00075598 |
| DeepSeek-V4-Flash | context narrowed | 971 | USD 0.00019953 |
| DeepSeek-V4-Flash | lazy discovery | 1,374 | USD 0.00026571 |
| DeepSeek-V4-Pro | broad catalog | 4,940 | USD 0.00256290 |
| DeepSeek-V4-Pro | context narrowed | 1,107 | USD 0.00079445 |
| DeepSeek-V4-Pro | lazy discovery | 1,653 | USD 0.00112169 |

These are first-observed runs, not controlled cache-disabled measurements;
later steps and related variants may already share cached prefixes. The valid
conclusion is only that cache accounting must not be confused with context
size or tool-selection complexity.

## Generic mechanism already exists

AI SDK 6 filters the provider-facing tool definitions when `activeTools` is
set. The application can retain a larger registry without sending every tool
schema on every model step. `prepareStep` can change that subset between steps.

Studied source:

- `labs/deepseek-learning-loop/node_modules/ai/src/prompt/prepare-tools-and-tool-choice.ts`
- `labs/deepseek-learning-loop/node_modules/ai/src/generate-text/prepare-step.ts`

Therefore neither deterministic narrowing nor a two-stage discovery sequence
requires a custom model/tool loop.

The learning-owned question is which tools are relevant to the current
activity and facts. The generic runtime can enforce the resulting exposure
set; it cannot decide whether an utterance is exposure, a formal result, a
correction, or another learning activity.

## Narrowing and discovery solve different problems

When authoritative context already identifies the activity kind, direct
narrowing dominated lazy discovery in this fixture:

- both exposed only the correct write executor;
- direct narrowing used one fewer model step;
- direct narrowing used fewer input and output tokens; and
- direct narrowing avoided another model-selected routing action.

Lazy discovery remains potentially useful when the relevant connector or tool
family is genuinely unknown until a search occurs. It should not be inserted
merely because the total registry is large. A discovery result also cannot
grant authority: permission filtering, provenance validation, and write
preconditions still belong at the host/executor boundary.

## Relation to pinned OpenCode

Pinned OpenCode v1.17.18, commit
`b1fc8113948b518835c2a39ece49553cffe9b30c`, uses two related but distinct
mechanisms:

1. ordinary tools are filtered by permissions and user configuration before
   request preparation, then all remaining tools except `invalid` are passed
   as active; and
2. experimental code mode exposes connected MCP tools through one confined
   `execute` tool. Small MCP catalogs are written into that tool's description;
   large catalogs contain a budgeted partial list and a runtime catalog-search
   function. Child MCP calls still pass permission checks and receive the
   session abort signal.

Studied source and tests:

- `.reference/opencode/packages/opencode/src/session/llm/request.ts`
- `.reference/opencode/packages/opencode/src/session/llm.ts`
- `.reference/opencode/packages/opencode/src/tool/code-mode.ts`
- `.reference/opencode/packages/opencode/test/tool/code-mode.test.ts`
- `.reference/opencode/packages/opencode/test/tool/code-mode-integration.test.ts`

Code mode is not equivalent to the two-stage experiment. It supplies a
confined orchestration language and can search a large MCP catalog from inside
one top-level tool call. It may reduce top-level tool-schema pressure and model
round trips for multi-tool work, but it also introduces a new orchestration and
authorization surface. ALS-006 did not evaluate that trade-off.

## Reduction boundary after ALS-006

### Demonstrated reusable mechanisms

- retaining a broad in-process registry while exposing a narrow provider-facing
  subset;
- changing the exposed subset between ordinary model steps;
- carrying a discovery result into the next tool-call step; and
- reporting per-step token usage and selected tools without a custom loop.

### Still learning-owned

- classifying the active learning activity from authoritative context;
- choosing the smallest semantically legal tool set for that activity;
- validating provenance, assistance, revision, and write preconditions; and
- deciding whether uncertainty warrants discovery instead of direct
  narrowing.

### Not demonstrated

- that 37 tools is a realistic production catalog;
- that broad catalogs cause wrong selections;
- that lazy discovery improves teaching or learning outcomes;
- that one global registry, several activity-local registries, or a code-mode
  facade should be the production interface; or
- that a model may safely turn discovery results directly into durable writes.

## Current working conclusion

Do not build a custom tool-loop abstraction merely to support lazy exposure.
Keep tool availability as a per-step policy input to the generic loop. When the
current learning activity is already known, expose the semantically legal
tools directly. Reserve discovery for genuine catalog uncertainty, and keep
authorization and educational validity outside the discovery mechanism.
