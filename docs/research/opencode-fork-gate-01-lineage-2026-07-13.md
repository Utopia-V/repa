# OpenCode fork Gate 1: lineage and provenance

Status: In progress

Date: 2026-07-13

Parent decision: [ADR-0014](../decisions/0014-one-time-opencode-fork.md)

Parent plan: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

## Parent uncertainty

Can Repa obtain the complete official OpenCode history containing the pinned
`v1.17.18` commit, preserve its MIT provenance, and make that exact tree the
new current product workspace without mixing it with the pre-fork Repa tree or
copying from `.reference/`?

## Owned boundary

This gate owns Git lineage, refs, worktree placement, and license provenance.
It exercises no production runtime or learning authority.

The official source is:

```text
repository: https://github.com/anomalyco/opencode.git
tag:        v1.17.18
commit:     b1fc8113948b518835c2a39ece49553cffe9b30c
license:    MIT
```

## Workspace arrangement

- The current product path remains
  `C:\Users\Discordance\Project\repa` and will be switched to
  `codex/opencode-v1.17.18-baseline` at the exact pinned commit.
- The pre-fork Repa `main` branch, including the accepted architecture and
  execution documents, remains directly readable at
  `C:\Users\Discordance\Project\repa-prefork-oracle`.
- Both paths are Git worktrees of the same local object database, so
  `git worktree list` and the `main` ref recover the oracle location even after
  conversation compaction.
- `.reference/opencode` remains ignored, read-only evidence and is not used as
  a fetch, copy, alternates, object, or worktree source.

## Explicit exclusions

- no dependency install, build, typecheck, or upstream test; those belong to
  Gate 2;
- no Repa rename or application-path change; those belong to Gate 3;
- no prompt, agent, command, route, database, or product-surface change;
- no merge of the unrelated pre-fork Repa and OpenCode file trees; and
- no staging or committing inside the fork baseline tree.

## Passing evidence

The gate passes only when all of the following are recorded:

1. the official remote resolves `v1.17.18` to the pinned commit;
2. the fetched repository is not shallow and contains the commit's complete
   reachable ancestry;
3. the fork branch and current worktree are clean and point exactly at the
   pinned commit and tree;
4. the pinned tree contains the upstream MIT license unchanged;
5. the old `main` oracle worktree is clean, readable at the recorded path, and
   contains this document plus the accepted Repa architecture; and
6. no `.reference/` path or local object alternate participates in the fork.

## Failure and rollback

Any tag/commit mismatch, shallow boundary, missing license, target-path
collision, dirty fork tree, or inaccessible oracle keeps Gate 1 red. Do not
continue to Gate 2.

Because both new artifacts are isolated and contain no user data, rollback is
bounded to switching the current worktree back to `main`, removing the clean
fork/oracle worktree registration as applicable, deleting only the newly
created `codex/opencode-v1.17.18-baseline` branch, and removing the
`opencode-upstream` remote. No rollback command is run automatically after a
failure; preserve the failed state for inspection first.

## Result

Pending execution.
