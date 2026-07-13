# OpenCode Windows shell progressive-metadata diagnostic

Status: Completed — no runtime streaming defect observed in the exact Gate 2
environment; the inherited test command is invalid for the selected shell

Date: 2026-07-13

Parent gate:
[OpenCode fork Gate 2](opencode-fork-gate-02-pristine-windows-baseline-2026-07-13.md)

## Question

Does the inherited failure of
`tool.shell abort > streams metadata updates progressively` show that OpenCode
cannot publish shell output before process exit on Windows, or does the test
fail before it exercises that behavior?

This diagnostic changes no tracked fork file, dependency, lockfile, existing
test, or production source. It uses condition-based probes in the oracle
worktree's ignored `tmp/` area.

## Correction to the initial Gate 2 interpretation

The initial Gate 2 record correctly preserved the observed failure but
incorrectly attributed it to Windows combining two valid writes into one
output chunk. The command did not perform two valid writes in the actual
shell.

The selected shell was:

```text
C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe
Windows PowerShell 5.1.26100.8655
```

The inherited test runs:

```text
echo first && sleep 0.1 && echo second
```

Windows PowerShell 5.1 does not support `&&` as a statement separator. A raw
execution produced no stdout, exited 1, and wrote a parser error that quoted
the original command:

```text
The token '&&' is not a valid statement separator in this version.
```

The test does not assert exit 0. Its two content assertions therefore match
`first` and `second` inside the parser error's echoed source line. Its final
`updates.length > 1` assertion measures how that one stderr diagnostic happens
to be chunked, not whether two successful writes were progressively visible.
The test failed twice with one non-empty metadata update and passed once in a
later isolated run, which is consistent with a non-contractual chunk boundary.

## Condition-based diagnostic

A bounded child probe replaced the invalid command only for diagnosis. It:

1. writes `first` to stdout and waits for the write callback;
2. waits for a release sentinel with a five-second timeout;
3. writes `second` only after the observer creates that sentinel; and
4. records a done sentinel after the second write callback.

At the full Shell Tool boundary, the `ctx.metadata` observer alone creates the
release sentinel after it sees `first`. The child therefore cannot emit
`second` or finish unless the first partial output has already crossed the
entire production path.

The same handshake was observed at progressively higher layers:

| Boundary | Decisive observation | Result |
| --- | --- | --- |
| raw `Bun.spawn` stdout | `first` became visible and released the child 24 ms before exit | passed |
| Effect ChildProcess `handle.stdout` | `first` released the child 40 ms before exit | passed |
| Effect ChildProcess `handle.all` | `first` released the child 25 ms before exit | passed |
| `handle.all` through `Stream.decodeText` | decoded `first` released the child 23 ms before exit | passed |
| Shell Tool through `ctx.metadata` | metadata contained `first`; only then was the child released; later metadata contained `first\nsecond\n`; the tool returned exit 0 | passed |

The Shell Tool timestamps were:

```text
metadata first visible: 1783953163761
release written:        1783953163763
child second-write done:1783953163781
metadata first+second:  1783953163785
tool returned:          1783953163806
```

There is no observed boundary in this exact environment where an upstream
layer sees `first` but the next layer withholds it until process exit.

## Result and scope

The current evidence finds no actual user-visible progressive-output defect in
the default Gate 2 Windows path. The defect is in the inherited test's
shell-independent command assumption and missing successful-exit assertion.

This result supports a separate test-contract correction, not a runtime patch
or permanent failure waiver. A correct regression test should:

- choose a valid command independently of PowerShell/cmd/bash separator
  syntax, preferably by launching a small Bun child directly;
- use an observer-driven condition handshake rather than fixed sleep;
- assert that `first` is visible before releasing the child;
- assert final `first` and `second` output and exit 0; and
- avoid asserting a particular operating-system chunk count.

The result is intentionally not generalized to cmd, Git Bash, PowerShell 7,
other Bun releases, or other Windows versions. The localized PowerShell error
text was mojibake when decoded through the combined stream; that separate
encoding behavior was not investigated because it cannot change this causal
finding.

## Reproduction artifacts and tree integrity

The ignored diagnostic artifacts are under:

```text
C:\Users\Discordance\Project\repa-prefork-oracle\tmp\gate2-shell-stream-diagnostic
```

They include the child handshake, raw/Effect layer probe, full Shell Tool
probe, JSON timestamp records, and the one isolated inherited-test log. These
are run artifacts, not production or committed lab code; the durable evidence
is this record.

Before and after the diagnostic, the fork remained at
`b1fc8113948b518835c2a39ece49553cffe9b30c`, ordinary Git status contained zero
items, and the diff against `v1.17.18` contained zero paths.
