# OpenCode fork Gate 2: pristine Windows baseline

Status: In progress

Date: 2026-07-13

Parent decision: [ADR-0014](../decisions/0014-one-time-opencode-fork.md)

Parent plan: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Prior gate: [Gate 1 lineage and provenance](opencode-fork-gate-01-lineage-2026-07-13.md)

## Parent uncertainty

Can the exact, unmodified OpenCode `v1.17.18` tree be installed, typechecked,
built as the released Windows x64 application, and pass the focused inherited
checks that own the later Repa cutover boundaries without routing the product
through preview v2?

## Owned boundary

This gate owns reproducibility evidence for the inherited Bun workspace,
`packages/core`, the released `packages/opencode` build entry, and focused
released-v1 behavior. It owns no Repa product semantics and makes no product
source change.

The execution environment admitted for this run is:

```text
OS:           Microsoft Windows NT 10.0.26200.0
architecture: x64
PowerShell:   5.1.26100.8655
Bun:          1.3.14+0d9b296af
packageManager requirement: bun@1.3.14
```

## Explicit exclusions

- no source, lockfile, package manifest, prompt, identity, path, database, or
  product-surface edit;
- no Repa rename or application-state isolation; those belong to Gate 3;
- no preview-v2 substitution for a failed released-v1 path;
- no provider matrix, real-provider call, interactive learning trace, or
  learning-authority behavior;
- no patch or compatibility workaround for an upstream failure; and
- no root test command, because the pinned repository explicitly requires
  package-scoped test execution.

## Positive evidence

Run these baseline commands in order from the exact clean tag tree:

```powershell
bun install --frozen-lockfile
bun run --cwd packages/core typecheck
bun run --cwd packages/opencode typecheck
bun run --cwd packages/opencode build --single --skip-install --skip-embed-web-ui
```

The build must select the native Windows x64 target, emit its binary, and pass
the build script's own `--version` smoke test.

Then run these package-scoped focused suites:

```powershell
bun test --timeout 30000 --only-failures test/database-migration.test.ts test/event.test.ts test/legacy-event-schema.test.ts test/permission.test.ts test/tool-bash.test.ts test/shell.test.ts
# cwd: packages/core

bun test --timeout 30000 --only-failures test/session/prompt.test.ts test/session/processor-effect.test.ts test/permission/next.test.ts test/permission/arity.test.ts test/permission-task.test.ts test/tool/shell.test.ts test/cli/tui/thread.test.ts test/cli/cmd/tui/attention.test.ts test/config/tui.test.ts
# cwd: packages/opencode
```

This set binds later work to inherited database migration and event behavior,
v1 Session prompt/processor continuation, permission, cancellation and
interrupted shell settlement, shell execution, and Windows-sensitive TUI
configuration/thread/attention behavior.

## Passing evidence

Gate 2 passes only when:

1. every command above exits zero on the recorded Windows/Bun environment;
2. the build artifact exists and reports the pinned application version;
3. the working tree remains at
   `b1fc8113948b518835c2a39ece49553cffe9b30c`, has the pinned tree
   `d47e0f4006aefaab6a2f9afc476c41f7107fec5f`, and contains no tracked or
   untracked product change after ignored build/install artifacts are
   accounted for;
4. no preview-v2 flag or substitute runner is needed to obtain the result;
5. failures, skips, timeouts, and warnings are inspected rather than hidden
   by an aggregate exit code; and
6. the final result and exact command outcomes are committed in the oracle
   worktree before Gate 3 is considered.

## Failure and rollback

The first non-zero command, tracked-file mutation, missing or non-runnable
Windows artifact, v2 dependency of the released path, or unexplained skipped
focused behavior keeps the gate red. Preserve its command, exit code, output,
environment, and artifact state before any cleanup. Do not patch the fork.

Rollback retains the exact baseline branch and the committed failure record,
then removes only verified ignored install/build artifacts such as root
`node_modules/` and `packages/opencode/dist/` using resolved paths inside the
fork worktree. Never remove or rewrite the tag, fork history, oracle worktree,
or an unclassified path.

## Result

Pending execution.
