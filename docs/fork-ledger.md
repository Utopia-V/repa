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
  `docs/research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md`.
  Its governing result is product reachability, not a source-deletion quota.
  The parent disposition correction is complete; Gate 5 remains open only for
  the inherited automatic GitHub repository-workflow registration boundary.
- `03fbb078e` corrected ADR-0014, Roadmap 09, the Gate 5 contract, README,
  ledger, and AGENTS continuity so baseline exclusion no longer authorizes
  source deletion by implication.
- `53b41aa0d` restored local `pr` as `gh pr checkout` plus Repa launch with no
  share-link branch, and restored the hosted GitHub Action only as unregistered
  source. The old sharing engines were not recreated: doing so would require a
  false compatibility shell over removed account/config/Console owners.
- `af506b635` accepted the local-directory invariant from Gate 5D5 while
  removing its second activation authority and all-or-nothing hydration
  commit. `Sync.bootstrap` is now the single publisher; successful background
  caches commit independently and failures leave truthful partial state without
  a new retry framework.
- `4b2c7229a` disconnected inherited updater configuration, flags, events,
  routes, runtime composition, generated current client surface, and TUI copy
  while retaining direct updater implementation and tests as hibernated source.
- `825b590b4` removed Zen/Go from built-in provider catalogs, plugin
  composition, ID-specific request/tool/selection behavior, recommendation,
  and retry upsell while preserving neutral explicit custom providers and the
  directly testable dormant provider implementation. `0daeb6de5` removed the
  commercial retry action from the current status schema, OpenAPI, and v2 SDK.
- Automatic account/share/sync behavior, OpenCode service requests, hosted UI
  proxying, remote routes/selectors, and misleading TUI affordances remain
  disconnected by the earlier 5B, 5C, and 5D commits recorded in the Gate 5
  document.
- Web/Desktop, marketplace, hosted GitHub automation, first-party commercial
  provider policy, and updater implementation may remain hibernated. Runtime
  reachability is corrected, but all 26 inherited workflow definitions remain
  registered. Besides automatic build/deploy/publish behavior, they include
  upstream community-governance bots, hosted Agent/review entry points,
  repository-writing generation jobs, and CI tied to upstream branches,
  runners, and package scope. Unregistering those inherited definitions while
  retaining their source is the one remaining Gate 5 parent problem. Designing
  Repa-owned CI is a later engineering decision, not part of this Gate.
- Physical source deletion requires concrete compatibility conflict,
  continuing maintenance cost, security risk, or explicit product rejection.
  Dependency closure, temporary lack of callers, and recoverability from Git
  history are not sufficient. A future Repa updater still requires Repa-owned
  package provenance, integrity, failure, rollback, and release-channel
  contracts before activation.

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
