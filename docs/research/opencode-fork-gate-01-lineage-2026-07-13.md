# OpenCode fork Gate 1: lineage and provenance

Status: Passed

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
  `C:\Users\Discordance\Project\repa` and is checked out on
  `codex/opencode-v1.17.18-baseline` at the exact pinned commit.
- The pre-fork Repa `main` branch, including the accepted architecture and
  execution documents, remains directly readable at
  `C:\Users\Discordance\Project\repa-prefork-oracle`.
- Both paths are Git worktrees of the same local object database, so
  `git worktree list` and the `main` ref recover the oracle location even after
  conversation compaction.
- Pre-fork ignored local assets (`.reference/`, `.repa/`, `.secret`, and
  generated lab contents) were moved without overwriting into the oracle
  worktree. They do not make the fork baseline dirty.
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

Passed.

Execution evidence:

- The pre-fork Repa documentation was committed on `main` as
  `66c83442e8d6229194aeaee5960a5449a18f125a` before the worktree switch.
- `opencode-upstream` fetches from
  `https://github.com/anomalyco/opencode.git`; the remote tag
  `v1.17.18` resolves to
  `b1fc8113948b518835c2a39ece49553cffe9b30c`.
- The fetched repository is not shallow. The pinned commit has 14,877
  reachable commits, `git rev-list --objects --missing=print` reported zero
  missing objects, and `git fsck --connectivity-only --no-dangling` passed.
- The current fork branch and tag both resolve to tree
  `d47e0f4006aefaab6a2f9afc476c41f7107fec5f`.
- The current `LICENSE` and the pinned tag both resolve to Git blob
  `6439474beed8e0271df9862eff97ffd70ec2464c`, whose header identifies the
  MIT License and OpenCode copyright.
- `C:\Users\Discordance\Project\repa` is clean on
  `codex/opencode-v1.17.18-baseline`;
  `C:\Users\Discordance\Project\repa-prefork-oracle` is clean on `main`
  and contains the accepted Repa documents.
- `.git/objects/info/alternates` is absent and
  `GIT_ALTERNATE_OBJECT_DIRECTORIES` is unset.
- Before switching trees, `bun run check` passed all 244 pre-fork Repa tests
  across 44 files with zero failures.

No dependency installation, upstream build, rename, product edit, or other
Gate 2+ action was performed.
