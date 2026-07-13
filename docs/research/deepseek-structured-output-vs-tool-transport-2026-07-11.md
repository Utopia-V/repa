# DeepSeek structured output versus tool transport

Date: 2026-07-11

Status: Research observation for ALS-014. This document does not choose one
universal provider-output mechanism or weaken tool authority for actions with
effects.

## Question

ALS-013 represented a side-effect-free batch of candidate task alignments as a
tool call. Is that necessary, or can ordinary JSON generation plus local schema
validation carry the same artifact projection more reliably or cheaply?

The frozen ALS-013 benchmark, prompts, forty records, lexical baseline,
annotation vocabulary, and semantic scoring were reused. Only the output
mechanism changed.

The live comparison used:

- **DeepSeek-V4-Flash (API, non-thinking)**; and
- **DeepSeek-V4-Pro (API, thinking=max)**.

ChatGPT GPT-5.6 Pro was not consulted for this batch.

## Mechanisms compared

### Tool transport

The model called `submit_alignment_batch`; Zod validated its arguments and the
executor recorded candidates only for the experiment. No durable learning or
curriculum write existed.

These results come from ALS-013.

### JSON-object transport

The model used AI SDK `Output.json`. The prompt included the exact compact JSON
shape, DeepSeek's `json_object` response format required parseable JSON, and
the same local Zod schema validated the parsed value afterward.

No executor ran. The output remained an untrusted projection.

The executable fixture is
`labs/deepseek-learning-loop/alignment-structured-output.ts`. Full traces are
retained in the local Git-ignored `.runs/` directory.

## Provider capability probes

Several failed smoke paths were retained and excluded from repeated results:

1. DeepSeek `json_object` rejected prompts that did not contain the literal
   concept "JSON".
2. OpenAI-compatible `Output.object` with native JSON Schema required the
   adapter's `supportsStructuredOutputs` capability.
3. When that capability was declared, DeepSeek rejected `json_schema` with
   `This response_format type is unavailable now`.
4. When the capability was not declared, the adapter downgraded to
   `json_object` and ignored the supplied schema at the provider boundary; the
   model output JSON but did not match the unprompted schema.

The final comparison therefore uses only a capability DeepSeek actually
accepted: `json_object` plus an explicit prompt contract and local Zod
validation. It does not claim native constrained decoding.

Relevant failed traces include:

- `2026-07-11T03-52-25.703Z-structured-output-task-alignment-deepseek-v4-flash.json`;
- `2026-07-11T03-53-16.250Z-structured-output-task-alignment-deepseek-v4-flash.json`;
  and
- `2026-07-11T03-55-16.542Z-structured-output-task-alignment-deepseek-v4-flash.json`.

## DeepSeek-V4-Flash comparison

Both mechanisms passed all three final trials with the same semantic result.

| Metric | Tool call | JSON object + local Zod |
|---|---:|---:|
| raw transport-valid trials | 3/3 | 3/3 |
| exact-record accuracy | 0.9750 | 0.9750 |
| edge precision | 0.9167 | 0.9167 |
| edge recall | 1.0000 | 1.0000 |
| edge F1 | 0.9565 | 0.9565 |
| input tokens per trial | 6,350 | 4,366 |
| output tokens per trial | 5,365 | 3,558 |
| elapsed per trial | 48,966 ms | 24,296 ms |
| estimated upper-bound cost | $0.00161300 | $0.00102800 |

On this cached repeated sample, the JSON path used about 31% fewer input
tokens, 34% fewer output tokens, 36% lower estimated cost, and 50% less elapsed
time. The stable semantic miss was unchanged: the flat schema could not express
the recursion-or-iteration alternative.

The compared traces are:

- tool: `2026-07-11T03-31-10.459Z-model-assisted-task-alignment-deepseek-v4-flash.json`;
  and
- JSON: `2026-07-11T04-02-01.915Z-structured-output-task-alignment-deepseek-v4-flash.json`.

## DeepSeek-V4-Pro comparison

Three complete tool trials were assembled from repeated trials 2 and 3 plus
the clean replacement trial documented in ALS-013. The JSON path used one
ordinary three-trial run.

| Metric | Tool call after bounded repair | JSON object + local Zod |
|---|---:|---:|
| raw transport-valid trials | 1/3 | 3/3 |
| post-validation valid trials | 3/3 | 3/3 |
| exact-record accuracy | 1.0000 | 0.9917 |
| edge precision / recall / F1 | 1 / 1 / 1 | 1 / 1 / 1 |
| input tokens per trial | 6,666 | 4,682 |
| output tokens per trial | 10,506 | 13,247 |
| reasoning tokens per trial | 6,829 | 10,118 |
| elapsed per trial | 158,137 ms | 147,812 ms |
| estimated upper-bound cost | $0.00927884 | $0.01168400 |

The JSON path eliminated the extra-closing-brace failures seen in two of three
complete tool trials and was about 7% faster, but it produced substantially
more output and reasoning tokens and cost about 26% more. Its only strict
semantic mismatch was one `none` versus `ambiguous` status on the disjunctive
recursion-or-iteration record; its alignment edges remained perfect.

The JSON trace is
`2026-07-11T04-09-54.728Z-structured-output-task-alignment-deepseek-v4-pro.json`.
The tool traces are listed in ALS-013.

## Interpretation

### Supported observations

1. A side-effect-free candidate projection does not need a tool call solely to
   obtain a typed shape.
2. For DeepSeek-V4-Flash on this fixture, `json_object` plus explicit shape and
   local Zod validation was materially smaller and faster with identical
   semantic results.
3. For DeepSeek-V4-Pro, the JSON path improved raw transport reliability but
   increased reasoning/output cost. There is no provider-independent winner.
4. DeepSeek did not support native `json_schema` in the tested API path.
   Application-side validation therefore remains necessary.
5. Transport selection and semantic authority are separate. JSON output cannot
   execute or authorize a learning effect.

### Unsupported claims

This batch does not show that:

- all side-effect-free model output should use JSON mode;
- JSON-object prompting is equivalent to provider-enforced JSON Schema;
- tool calls are inappropriate for read operations or effectful commands;
- one transport will remain best across providers, model revisions, or larger
  outputs; or
- candidate annotations are accurate on real course material.

## Reduction boundary after ALS-014

Use the mechanism that matches the actual operation:

```text
pure candidate projection
  -> provider-supported structured/JSON output
  -> local validation
  -> untrusted inspectable candidate

read or effectful operation
  -> tool call
  -> executor validation and authority
```

This is a working mechanism distinction, not a new agent framework. Provider
capabilities and failure behavior must be measured rather than inferred from a
common SDK interface.
