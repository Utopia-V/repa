# DeepSeek approval, cancellation, and repair experiment

Date: 2026-07-11

Status: Research observation for ALS-004. This document does not approve a
production permission model, cancellation guarantee, or tool-repair policy.

## Question

Can existing AI SDK 6 mechanisms carry approval, cancellation, and malformed
tool-call handling without Repa inventing equivalent generic infrastructure?

Live model runs used:

- **DeepSeek-V4-Flash (API, non-thinking)**; and
- **DeepSeek-V4-Pro (API, thinking=max)**.

ChatGPT GPT-5.6 Pro did not participate in these runtime experiments.

## Source behavior checked first

AI SDK's official tool documentation states:

- a tool with `needsApproval` does not suspend a running function;
- the first generation completes with a `tool-approval-request`;
- the application appends a `tool-approval-response` and performs a second
  generation;
- approval executes the tool, while denial is sent to the model;
- `abortSignal` is forwarded to the tool's `execute` options; and
- execution errors become `tool-error` parts, while invalid tool input can be
  handled by the experimental repair hook.

Sources:

- <https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#tool-execution-approval>
- <https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#abort-signals>
- <https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#tool-call-repair>

The local installed version is `ai@6.0.168`, matching the pinned OpenCode
reference.

## Approval experiment

One external-write tool declared `needsApproval: true`. The same initial
approval request was continued through two isolated histories: approved and
denied.

| Observation | DeepSeek-V4-Flash | DeepSeek-V4-Pro |
|---|---:|---:|
| Executions before decision | 0 | 0 |
| Executions after approved branch | 1 | 1 |
| Executions after denied branch | still 1 | still 1 |
| Model retried denied call | no | no |

For both models:

1. the first generation ended with a tool call plus an approval request;
2. no executor entry occurred before the application supplied a decision;
3. the approved history executed exactly once; and
4. the denied history produced natural-language denial without execution.

DeepSeek-V4-Pro's thinking/tool context survived the two-generation flow when
the second request reused AI SDK's `response.messages`. This is relevant
provider-compatibility evidence, not a general persistence guarantee.

### Cost

Complete approval calls reported:

| Model | Recorded model steps | Estimated upper-bound cost |
|---|---:|---:|
| DeepSeek-V4-Flash | 3 | USD 0.00012255 |
| DeepSeek-V4-Pro | 3 | USD 0.00059789 |

Aborted cancellation calls did not return complete usage, so their possible
billing is excluded from these figures.

## Cancellation experiment

Two local tools received the same `AbortSignal`. The controller aborted 25 ms
after executor entry.

### Cooperative tool

The tool installed an abort handler, cleared its pending work, threw an
`AbortError`, and did not commit.

Observed for both models:

```text
tool started
signal present
abort handler ran
commit = false
outer generation ended with controlled interrupt
```

### Uncooperative tool

The tool ignored the signal, waited 180 ms, and committed anyway. The outer
generation still ended with the same controlled interrupt.

Observed for both models:

```text
tool started
signal present and aborted
abort handler did not run
commit = true
outer generation ended with controlled interrupt
```

### Consequence

AI SDK supplies cancellation propagation, not cancellation truth.

```text
request to stop
!=
proof that no effect occurred
```

The executor must cooperate, and an external system may still leave an
uncertain effect after timeout or disconnection. A TUI showing “interrupted”
must not silently settle a learning or external write as “did not happen.”

## Malformed tool-call repair

A deterministic offline test used AI SDK's `MockLanguageModelV3` to emit:

```json
{"outcome":"VERIFIED"}
```

for a tool whose schema accepts only lowercase `"verified"`. The repair hook
rewrote the invalid call to an unexposed `invalid` tool carrying the original
tool name and validation error. The learning write never executed; the model
continued after receiving the invalid-tool result.

This mirrors the pinned OpenCode pattern in
`packages/opencode/src/session/llm.ts`: malformed calls are routed into an
explicit invalid-tool result rather than being allowed to reach the requested
executor.

The mechanism can repair or surface protocol shape. It must not “repair” an
unknown score, assistance condition, target, or educational interpretation by
guessing a value that passes validation.

AI SDK labels `experimental_repairToolCall` experimental, so depending on its
exact API remains premature even though the behavioral seam is useful.

## Reduction boundary after ALS-004

### Reusable generic machinery

- approval-request and approval-response message parts;
- prevention of executor entry before approval;
- continuation after approval or denial;
- propagation of abort signals into local tools;
- explicit tool-error continuation; and
- malformed-call interception/repair hooks.

### Application or domain authority

- which actions require approval;
- where approval requests and decisions are durably stored;
- whether a decision is still valid when context or policy changes;
- whether an interrupted executor committed, did not commit, or is uncertain;
- executor-specific cleanup and reconciliation; and
- prohibiting transport repair from inventing educational meaning.

This supports adopting the OSS protocol parts while leaving their durable and
learning-semantic interpretation in Repa.

## Not tested

- restart between approval request and response;
- stale approval after policy or learner-state changes;
- a forged or mismatched approval response;
- approval of several calls at once;
- remote side-effect reconciliation;
- provider timeout before tool executor entry;
- stream-level `onAbort` persistence; or
- UI rendering of pending approval.

## Raw local traces

```text
labs/deepseek-learning-loop/.runs/
  2026-07-11T01-46-22.274Z-approval-and-cancellation-deepseek-v4-flash.json
  2026-07-11T01-46-43.801Z-approval-and-cancellation-deepseek-v4-pro.json
```

The raw traces are sanitized and Git-ignored. Stable findings are recorded in
this document and the experiment ledger.
