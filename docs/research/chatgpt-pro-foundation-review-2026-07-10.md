# ChatGPT Pro review of the foundation runtime proposal

Date: 2026-07-10

Status: Independent model review and latency observation. This document is not
an ADR, does not approve the proposal, and does not authorize production
implementation.

## Invocation record

The private ChatGPT Pro bridge submitted the complete
[`Foundation runtime contracts`](../proposals/0001-foundation-runtime-contracts.md)
draft together with the accepted product constraints and an adversarial review
request.

```text
model: gpt-5-6-pro
model title: GPT-5.6 Pro
thinking effort: extended
bridge-reported elapsed time: 32,730 ms
Codex-observed wall time: 32,781 ms
```

The bridge verified the requested Pro model and Extended effort rather than
silently accepting a cheaper fallback. The call was not an immediate response.
One latency sample cannot establish whether model capability has changed:
server load, implementation changes, prompt shape, and response length all
affect elapsed time. The response's engagement with specific contracts is a
more useful signal than latency alone, but it is still not a controlled model
benchmark.

## Question scope

The review was asked to decide whether the draft is a necessary maintainable
foundation or defensive over-engineering. It was required to:

- classify the proposed runtime contracts as keep, simplify, or defer;
- find concrete identity, transaction, interruption, and recovery defects;
- judge whether learning is genuinely first-class rather than a thin tool
  attachment;
- resolve the missing `LearningOccurrence -> Evidence -> LearnerProjection`
  authority boundary without designing a complete ontology;
- compare horizontal runtime construction with a learning-semantic vertical
  slice; and
- distinguish accepted product constraints from unaccepted proposal shapes.

## Pro verdict

The model returned **Approve with major revisions**. Its main claim was that the
draft has identified real production failure boundaries, but several semantics
remain unclosed while the prose presents them with near-ADR certainty.

The strongest findings were:

1. The proposal specifies how a learning write can be idempotent without yet
   specifying the minimum educational meaning being committed. A receipt proves
   execution identity, not evidence semantics.
2. `indeterminate` is currently a terminal `ToolSettlement` even though the
   surrounding prose says it awaits reconciliation. Those meanings conflict.
3. A `ModelAttempt` is defined as one provider request, but the drain description
   appears to close it only after local tool execution. Provider settlement and
   local effect settlement need separate lifecycle boundaries.
4. Correction, retraction, and supersession are required by accepted product
   semantics but are absent from the minimum learning contract.
5. The proposed implementation order is horizontal and risks completing a
   generic runtime before a real learning fact constrains it. The review
   recommends a first production slice built around one concrete answer attempt,
   a rebuildable projection, and a demonstrably changed next action.

## Local assessment

### Findings supported by repository evidence

The first four findings expose real review blockers rather than stylistic
preferences. In particular, ADR-0003 already requires reports, evidence,
inference, actions, provenance, and correction to remain distinguishable. The
proposal's receipt-only minimum learning contract does not yet preserve that
meaning. The `indeterminate` and attempt/tool lifecycle conflicts can also be
shown directly from the proposed legal transitions and drain algorithm.

The implementation sequence should therefore not be accepted as written. A
vertical slice is preferable if it uses real SQLite boundaries and one concrete
learning occurrence; it must not be a disposable UI demo or a prompt-only
simulation.

The local source audit also found three blockers that the Pro response either
underdeveloped or missed:

- The proposal closes an open research question by requiring separate Learning
  Domain and Session-settlement transactions even when both mutations live in
  one SQLite database. A narrow shared transaction and the proposed
  receipt-reconciliation path should be compared under the same injected crash
  matrix before choosing one for local domain effects. External effects remain
  a separate case.
- `sessionSeq` is described as ordering every durable Session mutation, but the
  proposal does not say how one atomic transaction containing several rows
  receives sequence values or how the cross-table uniqueness and
  `sessionThroughSeq` cutoff are implemented. Its meaning must be reduced to
  either a transaction revision or an ordered Session fact and exercised in a
  small DDL/transaction test.
- The drain has continuation conditions but no finite turn, tool, token, time,
  or cost budget and no durable exhaustion reason. A model that repeatedly
  requests successful tools can therefore continue without a code-enforced
  bound. Resource limits are a runtime correctness contract, not merely a later
  product setting.

### Suggestions not accepted without further evidence

The response also made claims that should not be promoted directly:

- It called the use of `RuntimeInvocationID` as a domain idempotency key
  categorically wrong and proposed a new `LearningOperationID`. A runtime
  invocation can legitimately be an external idempotency key for a domain
  command. A distinct domain operation identity is justified only when a real
  non-tool ingress, correction flow, or ownership invariant requires it.
- It proposed `dispatching -> sent -> unknown` for provider attempts. A durable
  `sent` row cannot make a network send atomic with SQLite, so it does not remove
  the ambiguous crash gap by itself.
- It recommended both keeping the minimal `MessagePart` union and deleting
  `message_parts` in its replacement design. That is internally inconsistent.
- It proposed placing evidence conditions inside a typed occurrence and making
  evidence no separate authority. This may work for observed conditions, but it
  may also collapse observation and educational interpretation, contrary to the
  distinction the product is trying to preserve. A focused contract decision is
  still required.
- It asserted that a code-produced activity-candidate layer is required for
  learning to be first-class. That is a plausible task-selection design, not a
  consequence of the accepted product constraints.
- It retained durable permissions and effect reconciliation in the minimum
  first slice even while saying that slice should have no protected effect.
  These mechanisms can remain designed constraints without preceding the first
  learning-semantic path in production.

## Consequence

The independent review is evidence against approving the proposal unchanged.
It does not support replacing the draft wholesale with the model's alternative
types. The next design work should narrow the first educational fact boundary,
make correction semantics explicit, repair the two lifecycle contradictions,
and then reshape implementation around a vertical contract slice. Each proposed
new identity or table still needs a concrete owner and consumer.

## Capability observation

This invocation provides no evidence of a silent model/effort downgrade: the
bridge verified `gpt-5-6-pro` at `extended`, the response took about 32.7 seconds,
and it engaged with proposal-specific failure cases. It also does not prove that
the service is as capable as an earlier long-running Pro session. A meaningful
comparison would require a fixed blind prompt, preserved expected findings, and
multiple runs or an older result—not elapsed time alone.
