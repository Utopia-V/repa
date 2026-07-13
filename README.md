# Repa

Repa is a terminal-native, local-first agentic learning system. Its Tutor can
orient a learner, inspect local materials, explain and demonstrate, answer
questions, guide work and practice, revisit earlier material, plan substantial
assignments, and preserve only the durable meaning that improves later help.

The Tutor is the behavior of the whole Learning System, not a persona attached
to one model call. Models provide open-ended interpretation, generation, and
interaction; program-owned authorities preserve identity, sources, revisions,
permissions, correction, deterministic consequences, and long-running
continuity.

Repa is not a note generator, Anki skin, todo application, one-shot chat
teacher, or generic coding agent with a few learning tools.

## Current direction

[ADR-0014](docs/decisions/0014-one-time-opencode-fork.md) replaces the earlier
Repa-owned partial harness direction. Repa will be created from a one-time
full-history fork of OpenCode `v1.17.18` and then evolve as an independent,
learning-native TypeScript/Bun product.

The fork inherits the mature local Agent substrate—Session and typed items,
providers, tools, permissions, MCP, subagents, compaction, cancellation,
recovery, and terminal mechanics—while Repa owns the binary, defaults, product
semantics, native database, migrations, terminal surfaces, and release history.
Cloud, marketplace, sharing, and other group-product surfaces are outside the
baseline.

Learning is first-class rather than an overlay. One Repa-native SQLite database
contains Interaction plus separate source/artifact, Course View, Material Map,
learner record, Agenda, and Tutor-policy authorities. Generic message, event,
project, todo, or tool data never silently becomes learning truth.

The first fork uses OpenCode's released v1 execution path. Preview v2 remains
design evidence only; Repa will not ship two production runtimes. Existing
local coding capabilities remain available unless they cause a demonstrated
conflict, but they are not the default product meaning.

The active implementation sequence is
[the one-time fork baseline](docs/roadmap/09-one-time-opencode-fork-baseline.md).
It must prove a Windows build, one native database, atomic learning-command and
tool settlement, general material translation, a scripted learner through the
real provider/tool loop, restart, fresh-Session continuity, cancellation, and
compaction before the old runner is removed.

Earlier Course, Agenda, conditional-purpose, and provider traces remain
behavioral oracles. ALS-024 and the withdrawn minute-scale Assignment route are
historical research, not current work.

Start with the [documentation map](docs/README.md),
[current understanding](docs/current-understanding.md),
[system architecture](docs/architecture/00-system-architecture.md), and
[fork decision](docs/decisions/0014-one-time-opencode-fork.md).

## Current repository state

- Runtime/language: TypeScript on Bun.
- Production lineage: accepted one-time OpenCode `v1.17.18` fork; cutover not
  yet implemented.
- Source audits: pinned OpenCode `v1.17.18` and Codex `rust-v0.144.1` checkouts
  under `.reference/`, locked by `references.lock.json`.
- Reference boundary: `.reference/` is read-only evidence and is never the
  production fork source.
- Existing `src/` runner: pre-fork behavioral oracle, frozen against further
  generic expansion until cutover.

## Verification

```powershell
bun install
bun run check
```

The local reference checkouts are intentionally ignored by Git.
