# Repa primary TUI

Code in this package must satisfy the primary user-facing interaction contract
described by the
[product origin](../../docs/foundation/00-product-origin.md),
[Gate 5](../../docs/research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md),
and the [system architecture](../../docs/architecture/00-system-architecture.md).
It projects the Learning System; it does not own durable learning meaning.

This guide is the TUI's required product contract, not a claim that its current
routes, components, event handling, or tests already satisfy it. Audit visible
behavior and carrier wiring against the linked owners; do not turn an existing
UI behavior into policy merely because it is implemented or snapshotted.

## Required boundary

Own terminal rendering, input and key routing, local-directory activation,
Session navigation, typed permission/question interaction, and visible tool
and settlement presentation. Use the retained SDK/server/Session contracts;
do not duplicate Course, Goal, learner, Artifact, Turn, permission, or command
legality in component state.

One active local-directory snapshot governs directory-owned views. Entering a
Session selects its exact persisted directory before enabling its prompt. If
that material directory is unavailable, keep the durable transcript readable
and the prompt unavailable. Late or cross-directory events must not overwrite
the active view. Local project copies/worktrees are retained; remote Workspace,
sync/control-plane, sharing, and Console/account surfaces are not.

While a Turn is running, expose two distinct learner actions before first use:
strictly steer the exact visible running work, or keep an editable process-local
draft for a later root Turn. Do not silently queue, retarget, or convert one
into the other. Sessionless controls do not create a Session; under the
[Gate 17 bootstrap contract](../../docs/research/repa-gate-17-natural-language-learning-bootstrap-2026-07-22.md),
the first real learner input may create the Session and Turn it needs.

Before a consequential permission, show the exact bound object, scope,
operation, lifetime, and material warning. After a learning command, keep
committed, already-applied, no-effect, and failed results visible even if model
continuation fails. Unknown consequential projections fail closed; a generic
hidden output panel or later inspector is not equivalent commit-time evidence.

Automatically discovered project TUI config is inert under
[Gate 10](../../docs/research/opencode-fork-gate-10-content-root-authority-2026-07-17.md).
Do not let themes, keybindings, plugins, attention, prompt, layout, or input
settings from project origin become a side channel around configuration trust.

Focused checks from `packages/tui`: `bun test
test/cli/tui/prompt-busy-delivery.test.tsx
test/routes/permission-prompt.test.tsx test/routes/session-entry.test.ts
test/util/semantic-presentation.test.ts`. Add the relevant no-surface test when
changing sharing, Console/account, or remote-workspace reachability.
