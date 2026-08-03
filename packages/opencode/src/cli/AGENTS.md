# Repa CLI reachability and runtime admission

Changes in this subtree must preserve the admitted terminal entry carriers under
[Gate 5](../../../../docs/research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md),
the [runtime architecture](../../../../docs/architecture/00-system-architecture.md),
and the repository product baseline. Gate 5 records root registration at
`../index.ts`; use it to audit actual reachability, not to infer that every
registered command is authorized or correctly composed.

## Required boundary

Own command parsing, terminal admission, state-owner versus attached-client
selection, process lifecycle, and CLI presentation. The root registry is the
accepted admission point, but do not infer absence of reachability from one
file: audit shortcuts, aliases, startup, build, and dynamic paths as well. Any
alternate command exposure is a conformance defect, not a second admission
owner. Preserve the retained terminal carriers—ordinary TUI, direct/run,
explicit attach and serve, ACP, and local harness/configuration commands—
without turning any of them into a separate Tutor runtime.

Do not re-register hosted Web, OpenCode Console/account or organization,
sharing/share import, remote Workspace/sync/control-plane, updater, marketplace,
or hosted GitHub/release surfaces. Dormant source may remain for provenance or
maintenance; that is not permission to expose it through root shortcuts,
aliases, help, startup, or build/release composition.

All prompt-producing carriers use the same released-v1 Session/Turn/Agent/tool
loop and interactive Repa composition. CLI flags and Agent names cannot select
an internal model purpose. Presentation code may render typed permission and
settlement results, but it does not own domain meaning or silently replace an
exact-reply requirement with a broader approval.

The CLI adapter must preserve a hard admission distinction. In the recorded
Gate 6 implementation, `effect-cmd.ts` is the principal seam; audit every
launch path rather than assuming that one file proves complete coverage. A
state-owning command may materialize the local LearnerHome and project instance;
an attached client must not open a second local runtime or writer. One process
owns state-changing LearnerHome execution, while explicit attach is a carrier
to that owner, not a second database authority or automatic background daemon.

Focused checks from `packages/opencode`: `bun test
test/cli/help/help-snapshots.test.ts test/cli/root-shortcuts.test.ts
test/cli/database-admission.test.ts test/cli/run/permission.shared.test.ts`.
