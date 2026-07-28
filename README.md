# Repa

Repa is a terminal-native, local-first agentic learning system. Its Tutor
orients a learner, works with local materials, explains and demonstrates,
answers questions, guides practice and substantial assignments, revisits
earlier material, and preserves only durable meaning that improves later help.

The Tutor is the behavior of the whole Learning System, not a persona attached
to one model call. Models provide open-ended interpretation and interaction;
program-owned authorities preserve identity, sources, revisions, permissions,
correction, deterministic consequences, and long-running continuity.

Repa is not a note generator, Anki skin, todo application, one-shot chat
teacher, or a generic coding agent with a few learning tools.

## Current direction

Repa is an independent product created from a one-time full-history fork of
OpenCode `v1.17.18`. It inherits the mature local Agent substrate—Sessions,
providers, tools, permissions, MCP, subagents, compaction, cancellation,
recovery, and terminal mechanics—while Repa owns product semantics, defaults,
database authority, migrations, terminal surfaces, and release direction.

Learning is first-class rather than an overlay. Coding, Git, LSP, and other
local Agent mechanics may remain useful capabilities, but they are not the
default ontology and do not silently become Course, Goal, future attention,
Assignment, planning, Tutor, or learner state.

Engineering direction is accepted through numbered Gates, but this README does
not copy their volatile progress. The canonical current Gate disposition and
control point live only in the [documentation map](docs/README.md); the
[fork ledger](docs/fork-ledger.md) records exact evidence and corrections.

The first accepted product surface is the existing natural-language TUI.
Direct run, attach, local server, and ACP remain retained interaction carriers,
not alternate primary product UIs or separate Tutor runtimes. Inherited Web and
Desktop clients are not supported product surfaces unless real use earns a
later decision. The registered default build is terminal-only; an explicit
research flag may embed retained Web assets without admitting a Web product or
release surface. Cloud, account, sharing, marketplace, and inherited OpenCode
release surfaces are outside the baseline. That does not by itself require
deleting safe hibernated source. Ordinary external model providers, local
credentials, and explicit local capabilities such as PR checkout are separate
behavior boundaries.

## Documentation

Start with the [documentation map](docs/README.md),
[product origin](docs/foundation/00-product-origin.md),
[system architecture](docs/architecture/00-system-architecture.md), and
[fork decision](docs/decisions/0014-one-time-opencode-fork.md).

The [inherited-material index](docs/inherited/README.md) classifies preview-v2,
deferred-surface, archived upstream, and oracle documents that remain useful
without owning current Repa behavior.

The pre-fork implementation, research logs, and labs remain historical oracles;
they are not migration targets or compatibility requirements.

## Development

Repa uses TypeScript and Bun. Install dependencies at the repository root, then
run focused tests and typechecks from the affected package:

```powershell
bun install
cd packages/opencode
bun test <relevant-test-files>
bun run typecheck
```

Root-level tests intentionally fail. Verification is proportional to the
changed claim; consult [AGENTS.md](AGENTS.md) before modifying the fork.

## Provenance

The fork preserves OpenCode's full upstream history and MIT license. Exact
source pins, Gate commits, and the immutable pre-fork oracle locator are
recorded in the [fork ledger](docs/fork-ledger.md).
