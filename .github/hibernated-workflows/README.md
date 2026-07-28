# Hibernated inherited workflows

These workflow definitions are preserved from the pinned OpenCode fork but are
deliberately outside GitHub's active `.github/workflows` registration
directory. They do not describe supported Repa automation, CI, governance, or
release behavior.

Current Repa authority is indexed by the
[documentation map](../../docs/README.md).

Do not restore a definition merely because its source is available. A future
Repa-owned workflow must be admitted against the repository, branch, runner,
permission, secret, package-scope, and verification contract that actually
exists at that time. Designing that automation is outside Gate 5.

The `support/` scripts, composite actions, installer, SST deployment source,
and container definitions are preserved only with the workflows that
referenced them. They may depend on upstream commands, agents, accounts, or
release assumptions that Repa deliberately retired; their presence is not a
claim that the historical workflow remains runnable. Executable support
entrypoints fail closed unless an investigator explicitly sets
`REPA_RUN_HIBERNATED_OPENCODE_AUTOMATION=1`; that escape hatch is evidence
access, not Repa authorization to mutate or deploy upstream repositories,
branches, registries, releases, analytics, or issue trackers.
