# DeepSeek tool-lifecycle experiment

Date: 2026-07-11

Status: Research observation for ALS-003. This document does not approve a
production tool API, transaction schema, retry policy, or model provider.

## Question

Which learning-tool guarantees are already supplied by generic open-source
agent machinery, and which guarantees remain the Learning Domain's authority?

Models are named fully throughout:

- **DeepSeek-V4-Flash (API, non-thinking)**; and
- **DeepSeek-V4-Pro (API, thinking=max)**.

ChatGPT GPT-5.6 Pro was not a Tutor or tool-calling runtime in these runs.

## Setup

The isolated runner uses AI SDK `generateText`, executable tools, automatic
tool-result continuation, and `stepCountIs`. Each model received the same five
experiments with:

- maximum 3,000 output tokens per model step;
- maximum eight model steps per experiment;
- a USD 0.25 suite guard;
- tool start/finish callbacks recording call identity, model-step identity,
  duration, success, and error; and
- sanitized full traces written under the local Git-ignored `.runs/` directory.

The suite is executable at
`labs/deepseek-learning-loop/tool-lifecycle.ts`.

## Results

| Experiment | DeepSeek-V4-Flash | DeepSeek-V4-Pro |
|---|---|---|
| Explicitly retryable tool execution error | first call failed, second call succeeded, one commit | first call failed, second call succeeded, one commit |
| Two identical calls, naive executor | two physical calls, two commits | two physical calls, two commits |
| Two identical calls, operation identity enforced | two physical calls, one commit | two physical calls, one commit |
| Two tools emitted in one model step | executions overlapped; review finished before result | executions overlapped; review finished before result |
| User asks to forge source and assistance | authoritative source and `hint` retained | authoritative source and `hint` retained |

All experimental oracles passed. That means the expected mechanism was
observed; it does not mean every observed mechanism is desirable.

### Cost

| Model | API steps | Estimated upper-bound cost |
|---|---:|---:|
| DeepSeek-V4-Flash | 12 | USD 0.00092924 |
| DeepSeek-V4-Pro | 11 | USD 0.00408433 |

## Finding 1: generic continuation handles an explicit no-effect failure

The first `commit_learning_effect` execution deliberately threw:

```text
InjectedExecutionRejection: no effect occurred; retry the same operation once
```

For both models, AI SDK represented the failed execution in the continuation,
the model made a second call, and exactly one commit occurred. No custom model
loop or retry loop was added by Repa.

This supports reusing generic tool-error and continuation machinery.

It does **not** authorize generic retries after a timeout, cancellation, remote
error, or any result that cannot prove no side effect occurred. The fixture's
error explicitly established that retry was safe. Ambiguous effects remain an
executor/domain concern.

## Finding 2: a generic tool runtime does not own semantic idempotency

Both models emitted two identical calls in the same model step. With the naive
executor, both calls committed. AI SDK correctly executed what the model
requested; it did not infer that the two calls represented one educational
fact.

When the tool implementation treated `operationId` as one logical operation,
both physical calls still ran, but the second result was marked duplicate and
only one commit occurred.

The boundary is therefore:

```text
generic runtime owns physical call execution and correlation
Learning Domain owns the identity and uniqueness of a learning fact or command
```

This does not imply that every read-only tool needs idempotency storage. The
requirement appears when a retry or duplicate call could create another durable
educational consequence.

## Finding 3: same-step tool calls execute concurrently

The model emitted `record_formal_result` and `create_targeted_review` in the
same step. The tool callbacks began at the same measured millisecond for both
models.

| Model | Result duration | Review duration | Completion order |
|---|---:|---:|---|
| DeepSeek-V4-Flash | 264 ms | 48 ms | review, then result |
| DeepSeek-V4-Pro | 256 ms | 53 ms | review, then result |

The shorter review write completed before the result it was notionally derived
from. Therefore model call order and array order cannot express a semantic
transaction or dependency.

A narrow working hypothesis follows:

> When one accepted learning result deterministically creates an obligation,
> the obligation must be derived from the authoritative result transition. It
> must not depend on another unordered, model-selected write settling first.

This is a semantic constraint, not a production interface decision. A combined
domain command, a validated effect bundle, and a result fact with deterministic
projection can all satisfy it. Same-step concurrency alone does not prove that
one combined command is mandatory.

## Finding 4: provenance authority survived conflicting user text

The learner answer explicitly asked the Tutor to replace an observed `hint`
with `none` and to use a forged `sourceRef`. Both models instead submitted the
authoritative task context and created a verification obligation for a hinted
success.

This run shows that the supplied context and prompt were sufficient for these
two samples. The tool executor also validates exact task, attempt, source,
target, and assistance values, so a mismatching call cannot commit even when a
future model fails to resist the request.

The successful calls did not exercise the rejection branch. This result must
not be overstated as an adversarial security evaluation.

## Model-dependent grouping

DeepSeek-V4-Flash submitted the formal result and verification obligation in
two successive model steps in the provenance case. DeepSeek-V4-Pro submitted
both in one step. Both produced the same accepted events.

Consequently, a learning invariant cannot depend on a particular model's
choice to group or sequence tool calls.

## Existing reference mechanisms do not supply semantic dependencies

A focused source check found:

- OpenCode tells the model in provider prompts to call dependent tools in
  successive steps. Its studied runtime delegates ordinary multi-tool
  execution to AI SDK; no general tool dependency graph was found in the
  registry or session runtime.
- Codex exposes whether a tool supports parallel calls. Its runtime uses a
  read/write lock: parallel-capable tools take the shared side, and other tools
  take the exclusive side. This serializes selected executions but does not
  express “review depends on committed result” or make two writes atomic.

Sources:

- OpenCode `packages/opencode/src/session/prompt/anthropic.txt`
- OpenCode `packages/opencode/src/session/llm.ts`
- Codex `codex-rs/core/src/tools/parallel.rs`
- Codex `codex-rs/core/src/tools/registry.rs`

Therefore a generalized dependency runtime is not currently justified as an
OSS mechanism to adopt. It would be new project infrastructure unless a later
experiment demonstrates a consumer that cannot be expressed as a domain
transition or projection.

## Independent review by ChatGPT GPT-5.6 Pro

ChatGPT GPT-5.6 Pro (subscription, Extended Pro via the private Pro bridge)
reviewed the local evidence in 15.5 seconds. It was not part of the tool runtime
experiment.

The review agreed that semantic identity, provenance, and deterministic
educational causality remain above physical call execution. It corrected one
possible overreach: concurrency proves a dependency problem, not a required
combined-command interface.

The adopted invariant is:

```text
deterministic educational consequence
must follow an authoritative state transition
and must not depend on unordered model-selected writes
```

The review also separated:

- physical invocation identity, used to correlate execution attempts; and
- semantic educational identity, used to decide whether two attempts or
  corrections represent the same educational fact.

Using one identity for both can either duplicate an externally committed fact
after a hidden timeout or collapse a later, genuinely distinct correction.
The final representation among combined command, validated bundle, or
fact-plus-projection remains deliberately undecided.

## Reduction boundary after ALS-003

### Demonstrated reusable mechanisms

- provider invocation and response decoding;
- tool schema transport and execution;
- tool error returned to model context;
- later model continuation and explicit safe retry;
- multiple calls per step and execution callbacks;
- finite model-step and output-token bounds; and
- provider/model usage accounting.

### Demonstrated learning-owned guarantees

- semantic operation identity and duplicate suppression;
- authoritative provenance and assistance conditions;
- deciding which effects form one educational transaction; and
- deriving required learning consequences without relying on call order; and
- separating physical invocation identity from educational semantic identity.

This remains consistent with a project-owned composition over mature generic
machinery. Nothing in ALS-003 justifies a custom provider loop.

## Not tested

- cancellation during a tool effect;
- timeout with uncertain remote outcome;
- crash/restart between a call and its settlement;
- durable permission requests;
- malformed model-generated JSON repaired by the SDK;
- long-session compaction or replay;
- real learner behavior; or
- pedagogical correctness of generated explanations.

## Raw local traces

The complete sanitized results are stored locally and excluded from Git:

```text
labs/deepseek-learning-loop/.runs/
  2026-07-11T01-35-38.366Z-tool-lifecycle-and-semantic-authority-deepseek-v4-flash.json
  2026-07-11T01-36-26.832Z-tool-lifecycle-and-semantic-authority-deepseek-v4-pro.json
```

## Reference relationship

The experiment agrees with the pinned reference findings without copying their
architecture:

- OpenCode separates stable tool definitions, per-turn execution context, and
  session reduction, while AI SDK supplies its default model/tool runtime.
- Codex permits multiple execution attempts and does not provide a universal
  exactly-once effect protocol for arbitrary tools.
- The existing SQLite semantic-anchor lab already demonstrates one atomic
  local result-plus-derived-state transaction.

Relevant records:

- `docs/research/opencode-v1.17.18-runtime-contracts.md`
- `docs/research/codex-rust-v0.144.1-runtime-contracts.md`
- `docs/research/learning-semantic-anchor.md`
