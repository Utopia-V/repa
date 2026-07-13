# Fork provenance and gate ledger

Status: Active production-fork ledger

## Lineage

| Item | Exact identity | Role |
| --- | --- | --- |
| OpenCode | `v1.17.18` / `b1fc8113948b518835c2a39ece49553cffe9b30c` | Full-history MIT fork origin |
| Codex | `rust-v0.144.1` / `44918ea10c0f99151c6710411b4322c2f5c96bea` | Read-only secondary design reference |
| Pre-fork Repa oracle | `repa-prefork-oracle` / `db1ffdc4c84d52299c96e25121a776f7720ff9f2` | Immutable product, decision, research, and legacy-asset evidence |

Locally materialized reference checkouts are ignored files beside the oracle
worktree. Their pins are durable; their paths are not part of this fork.

## Closed gate sequence

| Gate | Result | Fork commit | Historical record |
| --- | --- | --- | --- |
| 0. Oracle freeze | Pre-fork behavior and assets classified | pre-fork lineage | `docs/roadmap/09-one-time-opencode-fork-baseline.md` at the oracle tag |
| 1. Lineage | Exact full-history `v1.17.18` fork with MIT provenance | `b1fc8113948b518835c2a39ece49553cffe9b30c` | `docs/research/opencode-fork-gate-01-lineage-2026-07-13.md` |
| 2. Windows baseline | Preserved inherited invalid PowerShell test failure | exact upstream tree | `docs/research/opencode-fork-gate-02-pristine-windows-baseline-2026-07-13.md` |
| 2A. Test correction | Corrected only the invalid shell test contract | `a72f507de45788f3fb8556d883cdad919f33db43` | `docs/research/opencode-fork-gate-02a-deterministic-windows-shell-test-2026-07-13.md` |
| 3. Repa identity | Independent binary, paths, config, runtime variables, and database filename; no OpenCode-state fallback | `0ffed9f62159b5383b62da73bd270de7f8775e09` | `docs/research/opencode-fork-gate-03-repa-identity-isolation-2026-07-13.md` |
| 4. Learning-first composition | One protected Repa product core across released-v1 carriers, narrow hidden operations, and truthful stock profiles | `9c7b74f41c6090bc0fa0499c4b1345fa438f0ca6` + `17e25eab2784b8bd71bef7a91effb9ae352bf0ae` | `docs/research/opencode-fork-gate-04-learning-first-composition-2026-07-14.md` |

Read a historical record with:

```powershell
git show repa-prefork-oracle:<historical-record-path>
```

## Active and deferred boundaries

- Gate 4 is closed: released-v1 model carriers and stock profiles implement one
  learning-first Repa composition invariant.
- Gate 5 is active under
  `docs/research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md`:
  unregister excluded surfaces before dependency-closed deletion. Gate 5A
  passed at `6503c280762a8cb2cc04e2cd0021498a8f0aa174`: the excluded root CLI
  handlers and CLI-owned sharing/import network paths are gone while retained
  local commands remain. Gate 5B1 and 5B2 passed at
  `815a6a7c97ff1ad39e07fb8fead31fea61734473` and
  `8fc8b44790f7ddeb2b5a40736f6bafdb9e12d9ca`: the hosted Web catch-all is
  unregistered and HTTP Session creation is locally complete without
  automatic sharing. Explicit typed share/workspace/control-plane routes and
  instance-bootstrap synchronization remain tracked work. The related TUI
  consumers must be removed before Gate 5B3 unregisters those schemas and
  regenerates current SDK artifacts; no compatibility shell is admitted. Gate
  5D1 passed at `54fb79af0565a9d6d87b225e2802ee5e27df1f87`:
  active TUI sharing commands, tips, display, dedicated plugin property, and
  legacy alias are gone while passive historical data remains for later
  dependency closure. Gate 5D2 passed at
  `ce9299f506a1b1baf1577b3730e4d6124f5ebd3b`: Console/account organization
  commands, startup state, and provider branches are gone from the released
  TUI while ordinary provider authentication and the local debug console
  remain.
- The first accepted baseline is terminal-only. Web and Desktop clients are
  deferred until real use justifies a separately accepted support gate.
- OpenCode account, organization, share, marketplace, marketing, and release
  integrations remain outside the baseline. Zen and Go are not officially
  supported providers in the first baseline; users may reach a compatible
  endpoint only through the neutral generic custom-provider mechanism. No
  special provider IDs, Console login, anonymous access, catalog priority,
  pricing copy, or retry upsell is retained.
- The inherited updater is unreachable after Gate 3 because it targets OpenCode
  packages and release channels. A Repa updater requires its own package,
  provenance, integrity, failure, rollback, and release-channel contract.

## Historical evidence locators

### Pre-fork source audit

`docs/research/opencode-one-time-fork-audit-2026-07-13.md` at the oracle tag.

### Conditional-purpose evidence

ADR-0013's experiment and result packets remain under `docs/research/` at the
oracle tag. They are behavioral evidence, not production modules.

### Identity-isolation evidence

The complete Gate 3 contract and verification record remains
`docs/research/opencode-fork-gate-03-repa-identity-isolation-2026-07-13.md`
at the oracle tag. The active roadmap records its passing commit.
