# Learning-command settlement substrate

Changes in this subtree must satisfy the narrow shared settlement boundary
recorded by
[Gate 8](../../../../docs/research/opencode-fork-gate-08-learning-command-settlement-2026-07-16.md).
It is infrastructure shared by learning authorities, not a universal learning
event store or owner of their semantic effects.

## Required boundary

- Bind trusted learner occurrence, Turn/model operation, physical tool
  invocation, capability/permission outcome, clock, receipt, and exact terminal
  Tool Part settlement.
- Preserve physical replay/conflict, command-specific semantic-address
  reconciliation, one-mutation admission, source-unavailable tombstones, and
  transaction-first publication.
- Commit a successful local domain effect, receipt, invocation settlement,
  visible result, and required Interaction projection atomically.
- Keep generic physical settlement separate from each authority's semantic
  address, legal transition, preconditions, correction, and payload.

## Maintenance rules

Do not accumulate one nullable foreign key or interpreter branch per domain in
the generic ledger. Domain-owned associations and handlers compose at the
application boundary. Exact replay and already-committed semantic results
precede live-state checks; an interrupted or denied candidate never fabricates
an effect. Session deletion may remove transcript content but cannot cascade
away independently owned learning state or its minimal causal receipt.

Changes to closed unions, constraints, triggers, or settlement ordering require
a versioned migration and focused recovery/replay evidence. Start with
`bun test test/learning-command-settlement.test.ts` from `packages/core`; add
the affected domain and `packages/opencode/test/learning-command` suites when
the outer runtime seam changes.
