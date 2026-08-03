# Released-v1 learning-command adapter

Changes in this Repa-added subtree must satisfy the Gate 8 adapter contract
between the released-v1 Agent harness, the shared
[settlement substrate](../../../../docs/research/opencode-fork-gate-08-learning-command-settlement-2026-07-16.md)
and domain-owned handlers. The subtree must remain an application adapter
rather than a learning authority; existing runtime code does not get to reverse
that dependency.

## Required adapter boundary

Own host input preparation, runtime binding, hook/cancellation integration,
effective capability and permission projection, recovery dispatch, and the
typed semantic presentation shared by retained terminal carriers. Supply exact
Session/Turn/model-operation/Assistant/Tool Part/call identity and trusted
runtime facts; never accept model-authored identity, versions, clock,
permission, or provenance as trusted input.

Core learning-command owns physical settlement. Each Core domain owns its
semantic address, transition, preconditions, payload, and correction. Keep
that dependency direction: do not move domain SQL or legality into this
runtime, the Session processor, prompts, or presentation. Already-settled
results cannot be overwritten by generic processor output, and committed,
already-applied, no-effect, and failed outcomes remain visible even if provider
continuation fails.

Focused checks from `packages/opencode`: `bun test
test/learning-command/hooks.test.ts test/learning-command/permission.test.ts
test/learning-command/presentation.test.ts test/learning-command/runtime.test.ts`.
Add the command-specific Core test whenever a handler contract changes.
