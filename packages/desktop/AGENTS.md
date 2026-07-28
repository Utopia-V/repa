# Desktop package notes

> **Scope — retained source outside Repa's TUI baseline.** These notes apply only to explicitly admitted maintenance of the inherited OpenCode desktop package. They do not authorize a desktop/GUI product surface or participation in Repa startup, build, or release; root [AGENTS.md](../../AGENTS.md) routes the work, while accepted Repa ADRs and the owners indexed by the [documentation map](../../docs/README.md) govern any such change.

- Renderer process should only call `window.api` from `src/preload`.
- Main process should register IPC handlers in `src/main/ipc.ts`.
