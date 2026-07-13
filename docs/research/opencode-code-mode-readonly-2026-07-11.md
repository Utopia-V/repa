# Pinned OpenCode code-mode read-only experiment

Date: 2026-07-11

Status: Research observation for ALS-007. This document does not approve code
mode as a production interface, expose durable learning writes through an
interpreter, or make OpenCode a runtime dependency.

## Question

Pinned OpenCode contains an experimental confined code mode that gives one
top-level `execute` tool access to a schema-described tree of child tools. Is
that mechanism a generally useful agent-harness paradigm for Repa, or a
model- and workload-dependent optimization?

The live comparison used:

- **DeepSeek-V4-Flash (API, non-thinking)**; and
- **DeepSeek-V4-Pro (API, thinking=max)**.

ChatGPT GPT-5.6 Pro was not consulted for this batch.

## Exact source boundary

The tested interpreter was bundled from the read-only pinned source:

```text
repository: https://github.com/anomalyco/opencode.git
tag: v1.17.18
commit: b1fc8113948b518835c2a39ece49553cffe9b30c
source: .reference/opencode/packages/codemode/src
```

The generated bundle is local and Git-ignored. `.reference/` was not modified,
and the code is not imported by production code.

The live adapter and synthetic read-only learning tools are in
`labs/deepseek-learning-loop/code-mode-readonly.ts`. The experiment used the
actual pinned core interpreter, but not OpenCode's MCP service or complete
session runtime.

## Upstream behavior check

The pinned `packages/codemode/src` and `packages/codemode/test` trees were
copied to a system temporary directory, supplied with their declared exact
dependencies, and run without editing the reference checkout:

```text
263 tests passed
0 tests failed
7 test files
```

Those tests cover, among other behavior:

- confined parsing and supported syntax diagnostics;
- schema-described input and output boundaries;
- complete small catalogs and budgeted large catalogs with ranked search;
- tool-call and output limits;
- wall-clock interruption, including busy loops and in-flight calls;
- bounded output and log truncation;
- actual child-call observation;
- `Promise.all` concurrency capped at eight live calls;
- normalized tool failures and host defects; and
- JSON-safe values at the host boundary.

OpenCode-specific adapter tests under
`.reference/opencode/packages/opencode/test/tool/code-mode*.test.ts` were
inspected but not executed because the read-only checkout lacks its full
workspace runtime dependency `@opentui/solid/preload`. The core test result
must not be misreported as an end-to-end OpenCode application test.

## Live task

The model had to answer one read-only learning diagnostic:

1. read recent formal attempt `attempt:code-mode-1`;
2. obtain `candidatePrerequisiteId` from that result;
3. pass the returned identifier to both topic lookup and due-status lookup;
4. return the prerequisite id, title, status, and a concise reason; and
5. make no durable learning-state write.

The dependency was real at the executor boundary. Topic and review reads were
rejected unless the attempt read had completed and supplied the exact
identifier.

Two variants were compared:

- **direct tools** — three ordinary AI SDK tools; and
- **confined code mode** — one model-visible `execute_readonly_learning_query`
  tool whose implementation used pinned OpenCode code mode over the same three
  child reads.

The code-mode instructions for this three-tool catalog were 3,002 characters.
Each trial allowed six model steps and 3,000 output tokens. Ten repeated trials
per variant and model form the reported sample.

## Results

`Final answer` means the answer contained the authoritative prerequisite id,
title, and review status. `Strict orchestration` additionally requires one
successful top-level code-mode program, no diagnostic, and no failed child
call.

| Model | Variant | Final answer | Strict orchestration | Mean model steps | Mean top-level calls | Mean input tokens | Mean uncached input | Mean output tokens | Mean reasoning tokens | Mean elapsed | Mean cost upper bound |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| DeepSeek-V4-Flash | direct tools | 10/10 | 10/10 | 3.0 | 3.0 | 2,227 | 332.3 | 297 | 0 | 3,979 ms | USD 0.00013485 |
| DeepSeek-V4-Flash | code mode | 10/10 | 7/10 | 2.6 | 1.6 | 3,562 | 630.9 | 400 | 0 | 4,385 ms | USD 0.00020856 |
| DeepSeek-V4-Pro | direct tools | 10/10 | 10/10 | 3.0 | 3.0 | 2,630 | 569.1 | 459 | 218.2 | 10,178 ms | USD 0.00065436 |
| DeepSeek-V4-Pro | code mode | 10/10 | 10/10 | 2.0 | 1.0 | 2,914 | 507.9 | 514 | 215.9 | 7,925 ms | USD 0.00067719 |

Suite cost upper bounds were USD 0.00343408 for DeepSeek-V4-Flash and USD
0.01331547 for DeepSeek-V4-Pro.

## Model-dependent result

DeepSeek-V4-Pro consistently used code mode as intended. A representative
program had this shape:

```js
const attempt = await tools.evidence.recentAttempt({ attemptId })
const candidate = attempt.candidatePrerequisiteId
const [topic, review] = await Promise.all([
  tools.course.topic({ topicId: candidate }),
  tools.review.dueStatus({ topicId: candidate }),
])
return { candidatePrerequisiteId: candidate, title: topic.title, reviewStatus: review.reviewStatus }
```

It performed the dependent read and two parallel child reads inside one
top-level tool execution, then used one final model step. Relative to direct
tools, mean latency fell about 22%, while mean cost changed only slightly. The
code-mode variant did not require more reasoning tokens on average in this
sample.

DeepSeek-V4-Flash produced the correct final answer in every trial but met the
single-orchestration contract only seven times. In the other three trials it:

- used one `execute` call to read the attempt;
- used a second `execute` call to read topic and review data; and
- emitted a third program that failed with `ParseError` or
  `UnsupportedSyntax`.

The interpreter correctly surfaced those diagnostics and admitted no failed
child read. Nevertheless, the intended round-trip reduction was lost. Mean
input tokens, cost, and latency were all worse than direct tools.

This difference is the main result. A confined orchestration language can
reduce tool-loop round trips when the selected model reliably writes one legal
program. It is not a model-independent harness improvement.

## The first failed smoke run

An earlier smoke run failed before any child tool because the experiment
bundle incorrectly inlined TypeScript's CommonJS enums, producing
`undefined.ESNext`. DeepSeek-V4-Flash retried the same broken executor six
times. The bundle boundary was corrected by treating pinned TypeScript as an
external dependency.

That trace remains in the local `.runs/` directory. It is excluded from the
model comparison because it measured a laboratory assembly defect. It still
reinforces ALS-003 and ALS-004: a model may repeatedly retry a tool failure, so
an executor must classify retry safety and enforce finite steps.

## What code mode does and does not own

### Reusable generic behavior

- one confined program can express dependent and parallel child calls;
- child inputs and outputs cross schema/data boundaries;
- the host can observe admitted child calls and outcomes;
- the runtime can cap calls, time, output, and concurrency;
- large catalogs can use budgeted inline descriptions and runtime search; and
- diagnostics can return to the ordinary model loop for repair.

### OpenCode adapter behavior, not core interpreter authority

Pinned OpenCode's MCP adapter performs a permission check for every child MCP
call, forwards the session abort signal, triggers plugin hooks, and projects
attachments/results. These properties are visible in
`.reference/opencode/packages/opencode/src/tool/code-mode.ts`. They were not
part of the live synthetic adapter and therefore remain source observations,
not live Repa results.

### Still outside code mode

- deciding which learning facts are authoritative;
- validating provenance, assistance, and current revision;
- semantic idempotency and correction identity;
- deciding which educational effects form one transition; and
- proving the state of an external effect after timeout or interruption.

The interpreter documentation itself says that the host tool remains
responsible for authorization and durable side-effect handling.

## Consequence for Repa

Code mode should not become the learning layer or the universal tool path.
Current evidence supports a narrower hypothesis:

> A confined orchestration tool may be useful for complex, read-heavy,
> connector-heavy work when it eliminates dependent model round trips and the
> selected model is competent at the supported program subset.

For small tool sets and ordinary learning reads, direct tools are simpler and
were more reliable for DeepSeek-V4-Flash. For deterministic durable learning
transitions, the previous executor/domain invariants still apply; no evidence
from ALS-007 justifies exposing unrestricted learning-state writes inside code
mode.

The production choice remains open. If code mode is ever adopted, it should be
an optional generic orchestration mechanism selected by workload and model
capability, not a new first-class learning concept.
