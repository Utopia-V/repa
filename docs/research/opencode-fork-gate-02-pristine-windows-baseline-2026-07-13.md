# OpenCode fork Gate 2: pristine Windows baseline

Status: In progress — red after focused Windows test attempt 1

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
2. the build artifact exists, passes the build script's own version smoke
   test, and has its actual script-derived version recorded;
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

### Attempt 1: frozen install failed

Before installation, an ignored-artifact audit found the pre-fork Repa root
`node_modules/` and `tmp/` still present even though ordinary Git status was
clean. Both were moved without overwriting into the oracle worktree. The fork
then had no normal or ignored residue before the command began.

Command:

```powershell
bun install --frozen-lockfile
```

Outcome: exit 1 after 218.6 seconds. Bun reported 4,666 packages installed
and two failed packages:

```text
error: Fail extracting tarball for "sst-win32-x64"
error: failed to download sst-win32-x64@4.13.1: Fail
error: moving "fast-json-stringify" to cache dir failed
EPERM: Operation not permitted (NtSetInformationFile())
error: failed to download fast-json-stringify@6.4.0: InstallFailed
```

The install had reached native `tree-sitter-powershell` compilation through
`node-gyp`. It also ran the repository `fix-node-pty` and Husky postinstall
commands before returning the failure. After exit:

- no install or child build process remained;
- the tracked working tree and lockfile were unchanged;
- the partial dependency tree was present only through ignored
  `node_modules/` paths;
- neither failed package existed in root `node_modules/`; and
- both exact registry tarball URLs returned HTTP 200 immediately afterward.

The observed boundary is therefore package download/extraction or Bun cache
publication on Windows, not yet an attributed source or lockfile defect. No
source patch, cache deletion, retry, typecheck, build, or test had been
performed when this failure record was written.

### Attempt 2: isolated cold cache passed

A direct download probe fetched both failed tarballs, reproduced their exact
`bun.lock` SHA-512 values, and listed both archives successfully. The partial
attempt-1 install was then removed by validating and deleting only 38 Git-
ignored `.husky/_/` or `node_modules/` paths inside the fork. The normal and
ignored status were empty before the second attempt.

Attempt 2 changed one variable: it used a new empty cache through Bun's
documented `BUN_INSTALL_CACHE_DIR` while retaining the same command, lockfile,
integrity checks, lifecycle scripts, and default concurrency:

```powershell
$env:BUN_INSTALL_CACHE_DIR = 'C:\Users\Discordance\Project\repa-prefork-oracle\tmp\gate2-bun-cache-attempt-2'
bun install --frozen-lockfile
```

Outcome: exit 0 after 281.7 seconds. Bun reported 4,670 packages installed
and 539 dependencies resolved/downloaded/extracted. Both
`sst-win32-x64@4.13.1` and `fast-json-stringify@6.4.0` are present in the
installed Bun package tree. The working tree and index remain clean, and the
worktree `bun.lock` blob
`2f31450ed0f42d50bdc524a050b7f457627e5c4e` exactly matches the pinned tag.

This result localizes attempt 1 away from source, lockfile, registry bytes, or
archive validity and toward shared-cache publication or transient Windows
file locking. It does not distinguish those two cache-boundary causes and
does not erase the recorded first failure.

### Typecheck and Windows build passed

Both planned typechecks exited zero:

```text
packages/core:     tsgo --noEmit, exit 0, 6.2 seconds
packages/opencode: tsgo --noEmit, exit 0, 11.6 seconds
```

The planned single Windows x64 build exited zero in 9.4 seconds and its own
binary smoke test passed. The artifact was:

```text
path:    packages/opencode/dist/opencode-windows-x64/bin/opencode.exe
bytes:   142379520
sha256:  0434D3E97E0C54C7767CBB16C38C6B1CE0CCF1EC7E4E86B0F38AF829433CFCDB
version: 0.0.0-codex/opencode-v1.17.18-baseline-202607131353
```

The pre-execution contract incorrectly called for the tag version string.
Inspection of `packages/script/src/index.ts` showed that an ordinary branch
build intentionally derives a timestamped preview version from the branch
name unless `OPENCODE_VERSION` is injected. The parent gate requires the
pinned source and released-v1 build path to work; binary/product identity is
owned by Gate 3. Passing criterion 2 was therefore narrowed above to require
the built-in smoke and exact recorded output, without injecting a version.

### Focused test attempt 1: Windows shell environment failure

The core package-scoped command passed 93 tests across six files with zero
failures in 2.84 seconds.

The opencode package-scoped nine-file command exited 1 after 162.25 seconds:

```text
281 pass
14 skip
11 fail
762 expect() calls
306 tests across 9 files
```

All 11 failures came from `test/tool/shell.test.ts`. Windows-only fixtures
dereferenced `process.env.WINDIR`, but the test process received it as
`undefined`; failures therefore occurred while constructing expected
external paths, before the permission behavior under test could complete.
The attention test's logged decode/notification errors were expected
failure-path inputs and did not contribute failing tests.

No source, lockfile, or tracked artifact changed. The gate remains red. The
next diagnostic is limited to comparing the host `SystemRoot`/`WINDIR` values
with what Bun inherits; no test or product source patch is admitted.

Pending execution.
