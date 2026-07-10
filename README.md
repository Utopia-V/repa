# Agentic Learning System

This repository is the independent implementation workspace for a terminal-native, local-first learning agent.

The project is not a chat tutor, note generator, Anki skin, todo application, or desktop port of the earlier Rep course project. Its purpose is to make learning state, learning evidence, task selection, review, prerequisite repair, and real-world deadlines native parts of an agent workflow.

The repository is currently in its foundation and source-research phase. No production architecture should be inferred from empty directories or generated scaffolding. Start with the [`documentation map`](docs/README.md) and the durable product origin in [`docs/foundation/00-product-origin.md`](docs/foundation/00-product-origin.md).

## Current baseline

- Language/runtime: TypeScript on Bun.
- Primary engineering reference: OpenCode `v1.17.18`, pinned by `references.lock.json`.
- Reference policy: inspect and learn; do not import or depend on the reference checkout.
- Development policy: design critical contracts deliberately, then use AI inside those boundaries.

## Verification

```powershell
bun install
bun run check
```

The local OpenCode checkout lives under `.reference/` and is intentionally ignored by Git.
