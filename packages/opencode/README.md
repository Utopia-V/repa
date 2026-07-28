# Repa runtime package

This package contains Repa's released-v1 CLI/server runtime and the primary TUI
integration. Its historical package path remains `packages/opencode`, while
the executable and product identity are Repa.

Run package-local development and verification from this directory:

```powershell
bun run dev
bun test <relevant-test-files>
bun run typecheck
```

The repository intentionally rejects root-level test execution. The registered
default binary build is terminal-only; retained Web assets participate only
through the explicit research flag documented by the current build script.

Product meaning and current Gate status are owned by
[the Repa documentation map](../../docs/README.md). Repository-wide working
constraints live in [AGENTS.md](../../AGENTS.md).
