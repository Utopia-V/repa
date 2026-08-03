# JavaScript SDK carrier boundary

This package has mixed admitted and inherited generated surfaces. Read it under
[Gate 5](../../../docs/research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md)
and the repository [inherited-material boundary](../../../docs/inherited/README.md).
An OpenCode symbol or `v2` directory name is a package/wire compatibility fact,
not Repa product identity or production-runtime authority.

Gate 5's path classifications below are maintenance requirements, not proof
that current exports, consumers, generated output, or production registration
still conform. Audit those edges together; a path's existence or last caller
cannot settle its product disposition.

## Admitted versus frozen surfaces

- Gate 5 assigns `src/v2` as the generated SDK carrier for retained TUI, run,
  and ACP code. Its `v2` label identifies a wire family; it does not execute or
  admit the preview-v2 Agent runtime. Verify actual consumers remain inside
  that admitted carrier set.
- `src/v2/gen` is generated from the merged `packages/opencode` public OpenAPI
  by `script/build.ts`. Do not hand-edit generated files; keep the script's
  explicit post-generation invariants and fail when an upstream generator
  shape no longer matches them.
- `src/gen` is the frozen legacy generated tree. Gate 5 deliberately left it
  hibernated instead of hand-editing it to mimic the admitted API. Do not update
  it through last-reference reasoning or use it to restore a removed surface.
- Classify root legacy wrappers and exports through Gate 5 and admitted
  consumers. Actual callers and registration are reachability evidence, not
  disposition authority. Continued presence does not promise an OpenCode
  binary, config namespace, hosted service, or second Repa runtime.

The admitted SDK must stay directory-local and must not expose preview-v2 model
execution, remote Workspace/sync/control-plane, sharing, Console/account,
hosted Web, updater, or marketplace behavior absent from the public API owner.
Generated names such as `OpencodeClient` remain wire/package contracts and
must not be presented as outward Repa identity.

When the merged public OpenAPI changes, run `bun run build` from
`packages/sdk/js`, inspect only the generator-owned `src/v2/gen` diff, then run
the focused SDK test and `bun run typecheck`. Do not regenerate or rewrite the
frozen `src/gen` tree unless an explicit accepted decision changes its
disposition.
