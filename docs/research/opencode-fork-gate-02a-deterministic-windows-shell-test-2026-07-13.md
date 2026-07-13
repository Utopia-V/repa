# OpenCode fork Gate 2A: deterministic Windows shell streaming test

Status: Passed — inherited test defect corrected; Gate 3 may be planned

Date: 2026-07-13

Parent gate:
[Gate 2 pristine Windows baseline](opencode-fork-gate-02-pristine-windows-baseline-2026-07-13.md)

Root-cause evidence:
[Windows shell progressive-metadata diagnostic](opencode-windows-shell-progressive-metadata-diagnostic-2026-07-13.md)

Parent plan: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

## Parent uncertainty

Can the inherited progressive shell metadata test be made to exercise its
claimed user-visible behavior on the selected Windows shell without changing
runtime behavior, accepting a baseline exception, or relying on timing and
operating-system chunk boundaries?

## Owned boundary and exclusions

This gate owns only the inherited test contract for progressive Shell Tool
metadata. It changes no production source, provider path, terminal renderer,
dependency, lockfile, application identity, or Repa learning behavior. Gate 3
identity isolation remains separate.

The accepted diagnostic already proved the real runtime path from raw
`Bun.spawn` through Effect ChildProcess, `Stream.decodeText`, and
`ctx.metadata`. Gate 2A therefore does not patch, buffer, split, delay, retry,
or otherwise alter runtime output.

## Change

Fork commit `a72f507de45788f3fb8556d883cdad919f33db43`
(`test(opencode): make shell streaming check deterministic`) changes exactly:

```text
packages/opencode/test/fixture/shell-stream.ts
packages/opencode/test/tool/shell.test.ts
```

The fixture is launched directly with Bun through the actual configured Shell
Tool. It writes `first`, then waits at most two seconds for a release file. The
test's `ctx.metadata` observer writes that release file only after it sees
`first`. Only then may the fixture write `second` and exit.

The test now asserts:

- metadata observed `first` before release;
- that partial observation did not yet contain `second`;
- the final result contains both outputs; and
- the child exited 0.

Consequently the test cannot pass on a parser error, a fixed sleep, an
arbitrary chunk count, or output first delivered only after process exit.

## Verification

The standard process-level Windows variable omitted by the Codex parent was
restored only for each test process:

```powershell
$env:WINDIR = $env:SystemRoot
```

The corrected target was run first:

```powershell
bun test --timeout 30000 --only-failures -t "streams metadata updates progressively" test/tool/shell.test.ts
```

Result:

```text
1 pass
64 filtered out
0 fail
5 expect() calls
```

The directly affected test file was then run in full:

```powershell
bun test --timeout 30000 --only-failures test/tool/shell.test.ts
```

Result:

```text
65 pass
0 fail
185 expect() calls
```

No package typecheck, build, unrelated package test, or full repository suite
was run. This is deliberate causal scoping, not missing evidence: the change
contains only test code; Bun parsed and executed both changed files; the owning
test and its full containing file passed; and Gate 2 already recorded the
unchanged install, typecheck, build, core, and other OpenCode focused results.

## Result and rollback

Gate 2A passes. The exact-tag failure remains preserved as upstream baseline
evidence, while the independent Repa fork now has a truthful deterministic
regression test and no runtime workaround. Gate 3 may be planned from commit
`a72f507de45788f3fb8556d883cdad919f33db43`.

Rollback is the ordinary revert of that single test-only commit. It restores
the diagnosed invalid inherited test and no production behavior.
