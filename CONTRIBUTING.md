# Contributing to Repa

Repa is an independent product created from a one-time full-history fork of
OpenCode. OpenCode contribution rules, support links, release processes,
maintainer assignments, and roadmap statements preserved in Git history are
not Repa policy unless a current Repa authority explicitly adopts them.

## Start with current authority

- Read the [Repa overview](README.md) for the product boundary.
- Use the [documentation map](docs/README.md) for current Gate status and the
  documents that own product and architecture decisions.
- Read [AGENTS.md](AGENTS.md), plus any more specific `AGENTS.md` governing the
  files you change, for repository engineering rules.
- Use the [inherited-material index](docs/inherited/README.md) before relying on
  preview-v2, `.opencode`, or deferred-surface documentation.

An inherited package name, workspace entry, buildable source tree, or detailed
design note does not by itself make that material part of Repa's current
product surface, production runtime, roadmap, or release.

## Scope a change

Keep a change around one coherent product or engineering boundary. Explain the
outcome it establishes, the current authority it follows, why each changed file
belongs, and any behavior that remains deliberately outside scope.

Before implementing Gate-derived work, confirm in
[docs/README.md](docs/README.md) that the relevant contract is accepted and
authorizes implementation. Retained preview-v2 and deferred-surface material
may be maintained when the owning source requires it, but it is not
implementation authority for activating a second runtime or product surface.

## Development and verification

Use the Bun version declared by `package.json` and install dependencies from
the repository root:

```powershell
bun install
```

The repository intentionally rejects root-level test execution. Run checks
from the affected package and choose evidence proportional to the claim:

```powershell
cd packages/opencode
bun test <relevant-test-files>
bun run typecheck
```

Follow package-specific commands and generated-code rules in the applicable
`AGENTS.md`. Documentation-only changes normally need diff, link, formatting,
and worktree checks rather than unrelated product tests.

## Describe a proposed change

A pull request or handoff should state:

- the problem and resulting behavior;
- the owning Repa decision or observed defect;
- the scope and deliberate exclusions;
- the checks run and what they establish; and
- whether any inherited or hibernated material was touched without changing
  its product disposition.

Use a conventional title with one of the repository's accepted types:
`feat`, `fix`, `docs`, `chore`, `refactor`, or `test`. Scopes are optional.
