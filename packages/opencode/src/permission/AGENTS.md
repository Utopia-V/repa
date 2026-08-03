# Released-v1 permission arbitration

Changes in this subtree must preserve capability evaluation and the pending
approval lifecycle for the retained Agent harness. Apply the accepted trust and
presentation constraints in the
[system architecture](../../../../docs/architecture/00-system-architecture.md),
[Gate 5](../../../../docs/research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md),
and [Gate 8](../../../../docs/research/opencode-fork-gate-08-learning-command-settlement-2026-07-16.md).
Current matcher, event, or carrier behavior must be audited against that
contract; an existing permissive branch cannot expand it.

## Required boundary

Own ordered allow/ask/deny evaluation, authority-layer intersection,
process-local pending requests and approvals, replies, tool visibility, and
the runtime permission event projection. Automatically discovered
project-origin denies remain a final narrowing layer and cannot be undone by
machine or Agent defaults.

Permission answers whether a capability may proceed; it does not decide what a
learning command means or whether a domain transition is legal. Learning
commands still require exact bound identity, domain preconditions, atomic
settlement, replay, and correction. An `allow` never turns an unsupported
model assertion into truth, and a denied/interrupted Turn does not roll back a
domain effect that already committed.

Preserve exact capability, resource/pattern, Session, operation, scope, and
lifetime across request, carrier display, reply, and durable settlement.
Requests whose owning command requires an exact reply must not be widened into
an ambient or automatic approval. Unknown consequential projections fail
closed; generic hidden tool output is not an approval surface.

Focused checks from `packages/opencode`: `bun test
test/permission/next.test.ts test/permission/arity.test.ts
test/learning-command/permission.test.ts`. Include the affected TUI, direct-run,
or ACP permission test when changing a public reply or presentation contract.
