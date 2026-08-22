# Contributing to Repa

Start with the [Repa overview](README.md) and
[Building Repa](building/README.md). The handbook connects product
intent, representative learning situations, open research questions, the
current system, and the practical development path. The
[development guide](building/development.md) covers setup, repository
navigation, migrations, generated code, testing, and model experiments.

## Scope a change

Begin with the learning behavior or engineering invariant that should change.
Use a representative situation to describe what the learner will experience,
then trace the current production path far enough to find the responsible
boundary. Current modules are working answers: preserve the behavior they
already own, and let concrete product evidence motivate a different shape.

Keep each change around one coherent boundary. Include every layer required to
make that behavior truthful—data, tools, context, presentation, recovery, or
generation where they apply—and leave adjacent objectives for their own work.

## Development and verification

Use the Bun version declared by `package.json`. The repository intentionally
rejects root-level test execution, so run checks from the affected package and
choose evidence that can distinguish the claimed behavior:

```powershell
cd packages/opencode
bun test <relevant-test-files>
bun run typecheck
```

Coding agents follow the root and nearest nested `AGENTS.md` files for local
source constraints. Human-facing product and development guidance remains in
`building/` and this file. Documentation changes use diff, link, formatting,
and content checks; executable changes use the focused tests and typechecks
that exercise their actual dependency reach.

## Describe a proposed change

A pull request or handoff should state:

- the learning or engineering problem;
- the resulting behavior;
- the code boundary and important design judgment;
- the checks run and what they establish;
- observations that could motivate a later redesign.

Use a conventional title with one of the repository's accepted types:
`feat`, `fix`, `docs`, `chore`, `refactor`, or `test`. Scopes are optional.
