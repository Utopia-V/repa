# OpenCode Desktop

> **Status — retained OpenCode desktop source outside Repa's TUI baseline.** This package may be maintained as inherited Electron source, but its presence and the commands below do not make Desktop part of Repa's product, startup, build, release, or roadmap. An accepted Repa ADR or Gate must explicitly admit any such change.
> Current Repa authority is indexed by the [documentation map](../../docs/README.md).

This retained package contains the inherited OpenCode Desktop app built with Electron.

## Source-Local Development

```bash
bun install
bun dev
```

## Source-Local Build

When maintenance of this retained package is explicitly in scope, run the `build` script to build the app's JS assets, then `package` to
bundle the assets as an application. The resulting app will be in `dist/`.

```bash
bun run build && bun run package
```
