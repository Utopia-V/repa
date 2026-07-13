# OpenCode fork Gate 3: Repa identity isolation

Status: Passed — identity checkpoint accepted

Date: 2026-07-13

Parent plan: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Decision: [ADR-0014](../decisions/0014-one-time-opencode-fork.md)

Starting fork commit: `a72f507de45788f3fb8556d883cdad919f33db43`

Passing fork commit: `0ffed9f62159b5383b62da73bd270de7f8775e09`

## Parent uncertainty

Can the released-v1 process become an independently identifiable Repa binary
whose fresh launch cannot read or write application-owned OpenCode state,
without also rewriting the Agent loop, database schema, prompt semantics,
excluded product surfaces, or inherited internal package topology?

This gate is about observable product and state identity. A new XDG directory
alone is insufficient: inherited discovery of `opencode.json`, `.opencode`,
managed OpenCode configuration, or `OPENCODE_*` overrides would still let a
Repa process consume OpenCode-owned state.

## Native owner and inherited seams

The Repa executable and release entry point own the displayed product name and
binary name. The inherited `Global.Path` module owns data, config, cache,
state, temporary, log, binary-cache, and repository-cache roots. The v1 config
loader owns global, project, managed, and environment-provided configuration
discovery. `Database.path()` owns only the physical database path at this
gate; database admission and schema identity remain Gate 6 work.

The implementation may adapt those seams directly. It does not add a
compatibility layer, fallback home, second database, path manager, or parallel
runtime.

## Accepted observable identity

A production launch after this gate has these externally visible names:

- executable and CLI script name: `repa`;
- product display name: `Repa` where capitalization is prose, and `repa` in
  paths and machine-facing names;
- XDG data, config, cache, and state child directory: `repa`;
- application temporary child directory: `repa`;
- default SQLite filename: `repa.db`, with the inherited channel suffix rule
  applied to `repa-<channel>.db` when relevant;
- project configuration: `repa.json` or `repa.jsonc` and `.repa` directories;
- system-managed configuration roots and filenames use Repa identity; and
- OpenCode-specific process, runtime, build, test, and configuration variables
  accepted by the fork use the `REPA_*` prefix.

`OPENCODE_*` variables are not aliases. In particular they cannot redirect
Repa's home, configuration, database, plugin metadata, model cache, or test
isolation. External standards and provider variables such as `XDG_*`,
`OTEL_*`, `ANTHROPIC_API_KEY`, and `OPENAI_API_KEY` retain their established
names.

That rule does not rename an external OpenCode integration ABI into a false
Repa ABI. The retained OpenCode provider continues to accept
`OPENCODE_API_KEY`; the retained Console integration may materialize
`OPENCODE_CONSOLE_TOKEN`; and the inherited VS Code extension handshake may
inspect `OPENCODE_CALLER`. These names are scoped to their integration owners,
do not select Repa application state, and are not compatibility aliases. The
patched Photon dependency's private `__OPENCODE_PHOTON_WASM_PATH` global is
likewise an internal dependency ABI rather than a process environment option.

Internal TypeScript import scopes, Effect service tags, migration table names,
provider identifiers, source directories, and other implementation-only
OpenCode strings may remain when they do not select state or reach a user as
the product identity. This is the deliberate boundary between identity
isolation and a risky global string replacement.

## Explicit exclusions

This gate does not:

- add a Repa database marker, decide whether an existing file contains an
  admissible Repa schema, or rewrite migration history; Gate 6 owns those
  semantics;
- migrate, import, alias, copy, or offer compatibility for OpenCode or old
  Repa data, configuration, plugins, commands, or environment variables;
- change the default coding-first prompt, hidden prompts, Agent profiles, tool
  descriptions, or learning composition; Gate 4 owns that product meaning;
- retain, remove, or rename cloud, account, share, marketplace, control-plane,
  GitHub, update, or other inherited surfaces merely because their source
  contains an OpenCode name; Gate 5 owns reachability and disposition;
- rename `@opencode-ai/*` packages, source folders, Effect tags, schema tables,
  provider IDs, or every historical string; or
- introduce a generalized product-brand abstraction without two current
  consumers and an observable invariant that requires it.

The inherited config schema URL may remain temporarily if it is only schema
editor metadata and does not cause OpenCode state discovery. Its eventual
public disposition belongs with the configuration/product-surface audit.

One safety dependency was exposed by the identity cutover: the inherited
upgrade and uninstall entry points describe the running product but still
target OpenCode distribution packages. Gate 3 therefore makes those CLI and
automatic-update entry points unreachable and makes the retained HTTP upgrade
shape fail closed. It does not invent a temporary Repa installer. Gate 5 still
owns the final release-channel, update, uninstall, and API-surface decisions.
The inherited crash screen also stops preparing an OpenCode GitHub issue and
copies a local diagnostic report instead; Gate 5 owns any future reporting
destination.

## Positive evidence

The owning tests and Windows build must demonstrate all of the following:

1. With isolated `HOME` and `XDG_*` parents, `repa debug paths` reports only
   Repa application roots, and `repa db path` reports a Repa database name.
2. A configuration-loading command reads `repa.json`/`.repa` and ignores an
   invalid sibling `opencode.json`, an invalid `.opencode` tree, an invalid
   OpenCode managed config, and invalid `OPENCODE_*` configuration overrides.
3. Existing OpenCode data, config, cache, state, temporary, managed, and
   project trees remain byte-for-byte and metadata-stable across that launch;
   a sentinel OpenCode plugin is never evaluated.
4. A completely missing Repa application tree is created under the selected
   roots, and a second launch reuses it without touching OpenCode state.
5. The current-platform build produces a `repa-*` artifact containing a
   `repa` executable; its version/help output identifies the CLI as `repa`.

The read claim is behavioral rather than inferred from unchanged bytes alone:
the OpenCode config fixtures are intentionally invalid and the sentinel plugin
has an observable side effect if evaluated. A successful Repa config load with
no side effect therefore proves that those inherited discovery names were not
used on the exercised path.

## Failure and recovery evidence

- **Missing path:** absent Repa roots are created; no OpenCode directory is
  selected as a fallback.
- **Unusable path:** a deterministic file-versus-directory collision at a
  selected Repa root makes the launch fail non-zero and attributable. Repa
  does not fall back to OpenCode, the current directory, the user home, or a
  generic temporary directory.
- **Interrupted first launch:** a deliberately partial Repa tree plus one
  blocking collision represents a stopped first initialization. After the
  collision is repaired, the next launch completes the same tree
  idempotently; no cleanup or recovery step consults OpenCode state.
- **Database-name collision:** an existing `opencode.db` sentinel coexists
  untouched while Repa selects `repa.db`. A filesystem collision at the Repa
  database path fails explicitly and creates no alternate database. Semantic
  admission of a valid-looking OpenCode or unknown SQLite file intentionally
  remains red until Gate 6.

Tests snapshot every OpenCode sentinel before and after each process. Expected
failure cases must also preserve those snapshots; a non-zero exit alone is not
passing evidence.

## Verification scope

Implementation begins with process-boundary identity tests, followed by the
smallest source changes that make them pass. Verification is causal:

- run the new identity/isolation tests;
- run the directly affected existing global-path, database-path, config/TUI
  discovery, auth/path, CLI help, and build-smoke tests whose contracts change;
- run TypeScript checks for the changed production packages; and
- run the current-platform single binary build because the gate makes a binary
  identity claim.

Unrelated provider, network, full monorepo, and later learning-authority suites
are not mandatory at this checkpoint. The exact commands and results are
recorded here after execution.

## Recorded result

Gate 3 passed on 2026-07-13 at fork commit
`0ffed9f62159b5383b62da73bd270de7f8775e09`.

The final causal verification was:

- from `packages/opencode`,
  `bun test test/identity/repa-isolation.test.ts test/cli/help/help-snapshots.test.ts test/server/httpapi-global.test.ts`:
  6 passed, 0 failed, 32 snapshots, and 81 assertions;
- from `packages/tui`,
  `bun test test/theme.test.ts test/util/presentation.test.ts`: 9 passed, 0
  failed, and 17 assertions;
- `bun run typecheck` from each of `packages/core`, `packages/opencode`,
  `packages/tui`, and `packages/server`: all four passed;
- `bun run build` from `packages/app` and `packages/web`: both passed; and
- `bun run build --single --skip-install` from `packages/opencode`: passed and
  produced `dist/repa-windows-x64/bin/repa.exe`.

The built Windows executable was then launched with isolated home and XDG
parents. It reported only Repa application paths, selected
`repa-<channel>.db`, displayed Repa help with no OpenCode product name, and
exposed neither `upgrade` nor `uninstall`. The identity tests independently
proved that invalid OpenCode configuration, plugins, environment overrides,
and database sentinels are ignored; unusable or partial Repa roots and a Repa
database collision fail closed without an alternate path or OpenCode fallback.

One checkout-specific check remains non-actionable: `bun run typecheck` in
`packages/app` encounters `TS1128` because Git mode `120000`
`src/custom-elements.d.ts` is materialized as the literal symlink target on
this Windows checkout (`core.symlinks=false`). The same application passed its
Vite production build and the embedded single-binary build. No compatibility
copy or generated-file workaround was added.

The source audit found no remaining OpenCode-owned state/config/database
selector. Retained `OPENCODE_API_KEY`, `OPENCODE_CONSOLE_TOKEN`,
`OPENCODE_CALLER`, and `__OPENCODE_PHOTON_WASM_PATH` occurrences are the
scoped integration ABIs recorded above. Prompt, cloud/provider, updater source,
and internal asset/schema strings remain within the explicit later-gate
boundaries. `git diff --cached --check` passed before the checkpoint commit.
The full monorepo suite was intentionally not run because it does not add
causal evidence for this gate.

## Rollback

Before the gate passes, rollback is the ordinary revert of its fork commits
plus deletion of the disposable test Repa homes. No database downgrade or
OpenCode restoration step is valid because the passing implementation must
never modify OpenCode state. Any observed OpenCode read/write, silent path
fallback, dual-prefix compatibility, or second database keeps this gate red
and requires reverting the identity checkpoint rather than widening it.
