# Retained scoped steering authority

Changes in this subtree must preserve the retained Tutor-policy contract
recorded by
[Gate 15](../../../../docs/research/opencode-fork-gate-15-retained-scoped-steering-2026-07-20.md)
and [ADR-0010](../../../../docs/decisions/0010-scoped-learner-steering-is-policy-state.md).

## Required boundary

Own source-linked policy identity, semantic effect/address, bounded scope,
correction/supersession, temporal applicability, policy lineage/global
revision, bounded reads, active selection, and immutable per-model-operation
cut membership. Expiry is derived from stored time and the trusted clock; no
daemon or expiry event is required.

Retain only learner direction with a real future learning-interaction
consumer. This is not generic preference, memory, personality, motivation,
Goal, future attention, permission, or a universal policy language. Interaction
owns the causal occurrence; learning-command owns physical settlement; Turn
hosts the exact cut without absorbing steering meaning. The released-v1
request preparation renders the stored cut and cannot silently reinterpret or
broaden it.

Focused checks start with `bun test test/turn.test.ts
test/learning-command-representation-settlement.test.ts` from `packages/core`;
request lowering or prompt consumption changes also run the relevant
`packages/opencode/test/session` and
`packages/opencode/test/learning-command/runtime.test.ts`
cases.
