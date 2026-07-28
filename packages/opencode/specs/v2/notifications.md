# TUI Notifications Default

> **Status — inherited preview-v2 change proposal, not a Repa default.** This file is retained to explain or maintain deferred source. It does not authorize changing the released-v1 TUI default or enabling a preview runtime; those changes require an accepted Repa ADR or Gate.
> Current Repa authority is indexed by the [documentation map](../../../../docs/README.md).

Problem:

- v1 defaults `attention.enabled` to `false`
- users can opt in with `attention.enabled = true`
- v2 should make core TUI notifications a default behavior

## v2 Target

Flip `attention.enabled` to `true` by default in v2.

Keep `attention.enabled = false` as the explicit opt-out.
