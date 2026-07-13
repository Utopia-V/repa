# DeepSeek learning-loop experiment: OSS reduction boundary

Date: 2026-07-11

Status: Research observation. This document does not approve a production
architecture, schema, model provider, or educational policy.

Current scope note (2026-07-11): the experiment shows that a declared durable
effect cannot rely on model discretion alone. It does not show that ordinary
teaching must produce an obligation, evidence record, or learner projection.

## Question

Can the generic mechanics of an agent harness be reduced to mature
open-source machinery while learning remains a first-class product concern?

The competing failure modes were:

1. reimplementing provider, tool-loop, and continuation machinery without a
   demonstrated need; and
2. treating learning as optional prompt text and model-discretionary tools,
   leaving durable educational meaning probabilistic.

## Experimental boundary

The isolated lab at `labs/deepseek-learning-loop/` uses:

- `ai@6.0.168` for `generateText`, tool execution, result continuation, and a
  finite step condition;
- `@ai-sdk/openai-compatible@2.0.41` for the provider adapter;
- `zod@4.1.8` for tool input schemas; and
- DeepSeek V4 Flash and Pro through the official OpenAI-compatible endpoint.

Those dependency versions deliberately match the pinned OpenCode
`v1.17.18` reference. OpenCode's active runtime imports `streamText` from AI
SDK and reduces its events into OpenCode session state. The lab does not import
OpenCode source and does not implement its own provider/tool continuation loop.

The lab owns only the experimental learning boundary:

- an interaction context and declared activity contract;
- three learning tools;
- provenance and assistance validation;
- an in-memory event collection;
- deterministic contract checks; and
- scenario oracles and cost accounting.

No personal learning material was sent. The repository-root `.secret` is
ignored by Git and the key is never logged.

## Scenarios

The blind scripted suite used five cases:

| Case | Required semantic consequence |
|---|---|
| Ordinary clarification | no learning write |
| Selected explanation | verification obligation, no result |
| Independent formal miss | incorrect result plus targeted review |
| Correct after explicit hint | correct result retaining `hint`, plus verification |
| Source-bearing correction | retract the cited interpretation, no duplicate result |

The dual-model suite used Flash as a controlled learner and Pro as Tutor for
one misconception and one hinted answer. It is a stimulus-generation test, not
a user study.

## Blind results

| Run | Result | Estimated upper-bound cost |
|---|---:|---:|
| Scripted, Flash non-thinking | 4/5 | USD 0.00156255 |
| Scripted, Pro thinking=max | 4/5 | USD 0.00606254 |
| Model learner, Pro Tutor / Flash learner | 2/2 | USD 0.00308274 |

Both scripted suites failed the selected-explanation case. Flash produced a
natural-language verification question without persisting an obligation. Pro
used the entire 700-token output allowance and ended with `length` before a
tool call. The other four cases passed, including exact source identifiers,
real assistance conditions, targeted review, and correction without a
duplicate result.

The first failure is product-relevant: conversationally doing the right thing
is not the same as recording a durable learning consequence. The second is an
experiment-configuration failure as well as a lifecycle observation: an
output-limited activity must not be silently treated as completed.

## Selected-explanation ablation

The explanation allowance was raised to 1,600 output tokens and three policies
were compared.

### Model discretion

- Flash completed the explanation, asked a verification question in text, and
  still wrote no event in the final controlled run.
- Pro completed and called the obligation tool in its corresponding run.

This proves capability but not reliability. A model may understand and perform
the conversational action without performing the durable state transition.

### Forced tool selection

AI SDK `prepareStep` plus a forced first tool call worked for Flash
non-thinking without a custom loop.

DeepSeek Pro thinking returned HTTP 400 for explicit `tool_choice`. DeepSeek's
official integration guidance states that V4 thinking mode rejects the
`tool_choice` parameter. Its thinking-mode guide also requires replaying
`reasoning_content` after tool-call turns. This is a provider capability, not a
learning-domain rule.

Sources:

- <https://api-docs.deepseek.com/quick_start/agent_integrations/oh_my_pi>
- <https://api-docs.deepseek.com/guides/thinking_mode>
- <https://api-docs.deepseek.com/guides/tool_calls>

Therefore forced tool selection is a useful generic harness mechanism where
supported, but not a portable enforcement boundary.

### Declared completion contract

The alternative policy checks a declared activity contract after a normally
completed model turn. If the contract requires verification and no matching
obligation exists, it derives exactly one obligation from the known source and
target. It does not run on empty, interrupted, or `length`-terminated output,
and it does not duplicate an obligation created by the model.

This policy successfully supplied the missing Pro obligation when the model
completed without a tool call. It derives only a known future obligation; it
cannot derive an answer, score, misconception, or mastery claim.

## Contract-transfer test

The first postcondition was too broad when phrased as:

```text
selected explanation -> verification obligation
```

The refined hypothesis was:

```text
completed activity -> satisfy the consequence declared by its activity contract
```

Three explanation-shaped cases tested transfer:

1. learning and retention, contract requires verification;
2. reference material for another person, contract requires no learning write;
3. a learning explanation with no testing keyword, contract requires
   verification.

| Model | Model discretion | Contract enforcement |
|---|---:|---:|
| Flash non-thinking | 1/3 | 3/3 |
| Pro thinking=max | 3/3 | 3/3 |

The reference-only user wording did not state the expected no-write result; it
only requested text to forward to another person. Flash omitted durable
obligations in both learning cases while still teaching normally, and left the
reference-only case untouched.
Contract enforcement added the missing known obligation and left the
reference-only case untouched. Pro happened to satisfy all contracts itself;
the rule therefore added no duplicates.

The transfer test supports a thin boundary because the deterministic layer
reads a declared contract and observable completion state. It does not classify
the educational meaning of the raw conversation after the fact.

The final cleaned contract-transfer runs cost an estimated upper bound of USD
0.00105609 for Flash and USD 0.00663456 for Pro. Across all recorded exploratory
and final runs in this investigation, the summed conservative estimates were
about USD 0.034, excluding a small direct smoke probe and an HTTP-400 request
for which no complete usage record was returned. This is an experimental
estimate, not a statement of the provider's final bill.

## What the experiment supports

### Experimental facts

- AI SDK completed the provider -> tool -> result -> continuation cycle with
  DeepSeek without a project-owned agent loop.
- The same generic loop carried source identifiers, assistance conditions,
  corrections, and learning-specific events.
- Model-discretionary durable writes varied by model and run even when the
  natural-language behavior looked correct.
- DeepSeek thinking mode prevents explicit `tool_choice`, so that mechanism is
  not provider-neutral.
- A completion-contract check can enforce derivable learning obligations
  without inventing evidence.

### Working inference

The current evidence supports this division:

```text
Mature generic machinery
  provider calls, streaming/generation, tool schemas, tool execution,
  continuation, step limits, provider capability adaptation

Project-owned learning authority
  declared educational purpose, evidence admission, provenance,
  correction semantics, and validation of required learning consequences
```

This is narrower than “build a custom harness.” Harness ownership means owning
composition and product semantics, not rewriting universal mechanics.

It is also stronger than “attach a few learning tools.” A tool call is a model
action; the Learning Domain remains the authority on whether the declared
educational contract was satisfied.

## Confounds and limitations

- The sample is small and uses one provider family.
- System context and tool descriptions make the scenarios unusually explicit.
- One reference-only Flash response exposed internal context vocabulary to the
  learner. Context compilation and user-facing rendering remain separate
  concerns.
- The oracles inspect events and provenance, not whether an explanation is
  factually correct, well sequenced, or pedagogically appropriate. Several
  generated explanations contain wording that merits content review.
- Simulated learners obey a supplied misconception profile and do not represent
  human behavior.
- No persistence, crash recovery, long-term learner projection, curriculum
  loading, review schedule, or task-ranking behavior was tested.
- Passing contract enforcement by construction is useful only because the
  contract consequence is already known. Unknown evidence must be evaluated or
  left unresolved, never fabricated to satisfy a postcondition.

## Independent Pro review

An independent ChatGPT Pro review agreed with the generic-execution versus
learning-authority split and corrected its framing. The learning layer should
not be described as a post-processing patch. A selected activity declares an
educational contract; the learning layer validates that observable events
satisfy it.

The review proposed the contract-transfer test above and warned that a thin
validator would cease to be thin if it had to infer activity meaning from raw
conversation. The executable transfer result supports the declared-contract
variant but does not settle broader learning semantics.

## Architecture consequence, deliberately limited

No detailed production architecture follows from this run.

The only promoted constraint is:

> Reuse mature open-source mechanisms for generic agent execution. Own the
> declaration and validation of learning-significant consequences. Do not rely
> on model discretion to enforce a durable learning invariant, and do not
> invent educational evidence to make a contract appear satisfied.

The next experiment should start from the next unresolved product-loop edge,
not from a desire to fill out a harness diagram. A plausible edge is whether a
persisted verification or review obligation can change a subsequent selected
action under realistic competing work, but that experiment should define its
behavioral oracle before introducing a scheduler design.

## References

- Pinned OpenCode study: `docs/research/opencode-v1.17.18-agent-loop.md`
- Cross-reference runtime study:
  `docs/research/codex-rust-v0.144.1-runtime-contracts.md`
- Existing deterministic semantic lab: `labs/learning-semantic-anchor/`
- Scheduling working hypothesis:
  `docs/proposals/0002-learning-task-significance-and-scheduling.md`
