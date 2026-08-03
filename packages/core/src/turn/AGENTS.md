# Durable Turn and Interaction lifecycle

Changes in this subtree must preserve the generic durable Turn lifecycle
recorded by
[Gate 12](../../../../docs/research/opencode-fork-gate-12-durable-turn-lifecycle-2026-07-18.md)
under [ADR-0005](../../../../docs/decisions/0005-durable-turn-and-interaction-hierarchy.md)
and [ADR-0007](../../../../docs/decisions/0007-process-local-coordination-and-finite-turns.md).

## Required boundary

Own Turn identity, admission kind, exact Session/input/model/tool membership,
independent budgets, root/child lineage, terminal state, trusted causal time,
and restart recovery transitions. Partial durable work remains truthful but is
not promoted into completion. Start, exact-target steer, and interrupt are
different operations; no busy or stale path silently retargets input.

Turn is Interaction/harness authority, not Course, Artifact, navigation,
Goal, retained policy, learner evidence, Context, or Tutor-action meaning.
Learning authorities may cite trusted Turn identities but do not query runner
internals. Already committed domain effects do not roll back merely because a
Turn later fails or is interrupted.

Focused check: `bun test test/turn.test.ts` from `packages/core`. Changes that
touch reservation, released-v1 ownership, recovery, API projection, or busy
TUI delivery require the exact affected `packages/opencode` and `packages/tui`
Turn tests as well.
