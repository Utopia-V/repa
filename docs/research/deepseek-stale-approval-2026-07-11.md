# DeepSeek stale-approval experiment

Date: 2026-07-11

Status: Research observation for ALS-005. This document does not define a
production revision, permission, or optimistic-concurrency schema.

## Question

Does a valid approval decision remain sufficient when the learning context
changes before executor entry?

Live runs used:

- **DeepSeek-V4-Flash (API, non-thinking)**; and
- **DeepSeek-V4-Pro (API, thinking=max)**.

## Setup

The model requested one write with:

```text
operationId = stale-approval:write-1
expectedRevision = 1
```

AI SDK returned a `tool-approval-request`. The message history was serialized
to JSON and parsed back before the decision was admitted. The application then
changed the simulated current revision from 1 to 2.

The same valid approval response was continued through two branches:

1. a naive executor that trusted approval and ignored the current revision;
2. a guarded executor that revalidated the expected revision immediately
   before commit.

A third branch supplied a forged approval ID.

## Results

| Observation | DeepSeek-V4-Flash | DeepSeek-V4-Pro |
|---|---|---|
| JSON round-trip before approval | succeeded | succeeded |
| Forged approval ID | SDK rejected before executor | SDK rejected before executor |
| Naive executor after revision changed | stale write committed | stale write committed |
| Guarded executor after revision changed | rejected, zero commits | rejected, zero commits |

Both forged-ID branches returned:

```text
AI_InvalidToolApprovalError:
Tool approval response references unknown approvalId
```

The accepted histories contained 472 serialized bytes for
DeepSeek-V4-Flash and 711 bytes for DeepSeek-V4-Pro. The latter included enough
provider metadata for the thinking/tool turn to continue after JSON round-trip.
This is a serialization observation, not a crash-recovery guarantee.

### Cost

| Model | API steps | Estimated upper-bound cost |
|---|---:|---:|
| DeepSeek-V4-Flash | 3 | USD 0.00006700 |
| DeepSeek-V4-Pro | 3 | USD 0.00045402 |

The forged approval failed before executor entry and did not add a recorded
model step.

## Finding: approval and semantic validity are independent checks

AI SDK correctly correlates an approval response with an existing approval
request. It cannot know that a learner projection, source artifact, task,
policy, or plan changed after the request was formed.

The naive branch demonstrates:

```text
approval request valid
approval response valid
current semantic precondition stale
-> generic runtime executes unless the executor revalidates
```

The guarded branch demonstrates one possible protection:

```text
approved physical call
-> re-read authoritative current precondition
-> reject stale operation without effect
-> require a fresh decision
```

The durable invariant is narrower than a particular revision field:

> Authorization to attempt an operation does not establish that its semantic
> preconditions still hold at executor entry.

This applies to learning-state writes as well as external writes. It does not
mean every read-only tool needs a revision check.

## What remains reusable

- approval request/response correlation;
- rejection of unknown approval IDs;
- serializable provider/tool message parts for the tested round-trip; and
- continuation through approved and rejected tool outcomes.

## What remains application/domain owned

- the authoritative preconditions for a learning or external effect;
- deciding whether a changed context invalidates an earlier approval;
- revalidation timing;
- the behavior after stale rejection; and
- durable storage and expiry of requests and decisions.

## Non-claims

- The JSON round-trip was in one process and is not restart recovery.
- The experiment changed one integer revision and does not prove that a single
  global revision is the right production model.
- It did not test a permission-policy change from allow to deny.
- It did not test several concurrent approvals or partial remote effects.
- It does not require all learning operations to become approval-gated; routine
  learning-state updates remain non-blocking under ADR-0003.

## Raw local traces

```text
labs/deepseek-learning-loop/.runs/
  2026-07-11T01-50-46.898Z-stale-approval-semantic-revalidation-deepseek-v4-flash.json
  2026-07-11T01-51-00.274Z-stale-approval-semantic-revalidation-deepseek-v4-pro.json
```
