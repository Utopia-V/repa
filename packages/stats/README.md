# OpenCode Stats

> **Status — retained OpenCode stats source outside Repa's TUI baseline.** This README describes the inherited package layout and source-local commands. It does not make the stats site or its Lambda entrypoints part of Repa's product, startup, build, release, or roadmap; an accepted Repa ADR or Gate must explicitly admit that scope.
> Current Repa authority is indexed by the [documentation map](../../docs/README.md).

Within this retained source, Stats is a separate site from the console.
Runtime, database, and domain services live in `core`; the Vite app lives in
`app`; retained server entrypoints live in `server`.

## Packages

- `app`: Vite frontend/site.
- `core`: Effect services, app config, Drizzle schema/migrations, and stats domains.
- `server`: retained server entrypoints that call into `core` services.

## Source-Local Commands

- `bun run --cwd packages/stats/app dev` starts the retained app when its
  external configuration is available.
- `bun run --cwd packages/stats/app typecheck` typechecks the site.
- `bun run --cwd packages/stats/core typecheck` typechecks the Effect/database package.
- `bun run --cwd packages/stats/server typecheck` typechecks the retained server.
