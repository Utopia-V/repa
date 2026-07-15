# Fork provenance and gate ledger

Status: Active production-fork ledger

## Lineage

| Item                 | Exact identity                                                     | Role                                                             |
| -------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| OpenCode             | `v1.17.18` / `b1fc8113948b518835c2a39ece49553cffe9b30c`            | Full-history MIT fork origin                                     |
| Codex                | `rust-v0.144.1` / `44918ea10c0f99151c6710411b4322c2f5c96bea`       | Read-only secondary design reference                             |
| Pre-fork Repa oracle | `repa-prefork-oracle` / `db1ffdc4c84d52299c96e25121a776f7720ff9f2` | Immutable product, decision, research, and legacy-asset evidence |

Locally materialized reference checkouts are ignored files beside the oracle
worktree. Their pins are durable; their paths are not part of this fork.

## Original Gate close evidence

The commits below are the historical acceptance points. They do not override
the current disposition in `docs/README.md`; a later audit may preserve the
implementation evidence while reopening one bounded completion claim.

| Gate                                     | Result                                                                                                                                              | Fork commit                                                                             | Historical record                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 0. Oracle freeze                         | Pre-fork behavior and assets classified                                                                                                             | pre-fork lineage                                                                        | `docs/roadmap/09-one-time-opencode-fork-baseline.md` at the oracle tag                |
| 1. Lineage                               | Exact full-history `v1.17.18` fork with MIT provenance                                                                                              | `b1fc8113948b518835c2a39ece49553cffe9b30c`                                              | `docs/research/opencode-fork-gate-01-lineage-2026-07-13.md`                           |
| 2. Windows baseline                      | Preserved inherited invalid PowerShell test failure                                                                                                 | exact upstream tree                                                                     | `docs/research/opencode-fork-gate-02-pristine-windows-baseline-2026-07-13.md`         |
| 2A. Test correction                      | Corrected only the invalid shell test contract                                                                                                      | `a72f507de45788f3fb8556d883cdad919f33db43`                                              | `docs/research/opencode-fork-gate-02a-deterministic-windows-shell-test-2026-07-13.md` |
| 3. Repa identity                         | Independent binary, paths, config, runtime variables, and database filename; no OpenCode-state fallback                                             | `0ffed9f62159b5383b62da73bd270de7f8775e09`                                              | `docs/research/opencode-fork-gate-03-repa-identity-isolation-2026-07-13.md`           |
| 4. Learning-first composition            | One protected Repa product core across released-v1 carriers, narrow hidden operations, and truthful stock profiles                                  | `9c7b74f41c6090bc0fa0499c4b1345fa438f0ca6` + `17e25eab2784b8bd71bef7a91effb9ae352bf0ae` | `docs/research/opencode-fork-gate-04-learning-first-composition-2026-07-14.md`        |
| 5. Inherited product-surface disposition | Terminal-only baseline with excluded runtime and automatic repository surfaces disconnected; useful local capabilities and harmless source retained | `25e51861effbddbdb04ae8fe88c4107d34ab91b2`                                              | `docs/research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md` |
| 6. Native database admission             | Native Repa database identity and forward lineage with one state-owning process per LearnerHome; explicit attach remains a client                   | `6c0b7aa5b`                                                                             | `docs/research/opencode-fork-gate-06-native-database-admission-2026-07-14.md`         |
| 7. Course and Course View authority      | LearnerHome-owned Courses, stable View identities, immutable revisions and mappings, exact working selection, and reversible versioned withdrawal   | `3bd6eb9d4`                                                                             | `docs/research/opencode-fork-gate-07-course-view-authority-2026-07-15.md`             |

Read a historical record with:

```powershell
git show repa-prefork-oracle:<historical-record-path>
```

## Current audit disposition and deferred boundaries

- Gate 4 is open only for the internal-call trust boundary. Public admission
  can name a hidden primary Agent while request preparation treats `hidden` as
  authority to discard the interactive Repa composition. Hidden remains
  presentation metadata; program-owned operation purpose must authorize title,
  summary, compaction, and other narrow internal calls. The final carrier audit
  waits for Gate 5 to stabilize production reachability. The inherited v2
  prompt route is a Gate 5 registration defect, not a second runtime for Gate 4
  to maintain.
- Gate 5 retains its corrected reachability-over-deletion policy and its valid
  account/share/sync/updater/workflow disconnections, but its close claim is
  boundedly reopened. Production still registers the v2 prompt admission that
  can schedule model execution; provider IDs beginning with `opencode` still
  receive request/native-runtime privileges; provider login, model listing,
  and the run mini picker still recommend, prioritize, or label the commercial
  provider specially; and `https://*.opencode.ai` still has an automatic CORS
  grant. Explicitly configured custom providers remain valid but must be
  ordinary. Harmless v2/provider/Web/Desktop source remains hibernated rather
  than physically deleted.
- Gate 6 database admission and forward migration lineage remain accepted: a
  missing database receives one complete Repa baseline and later only
  Repa-owned migrations, while unrecognized state is refused without
  replacement. Its runtime-owner close claim is reopened because a resolved
  path string hashed beneath a process-selected state root neither identifies
  one physical database nor guarantees that contenders meet at one lock.
  Two-process evidence found dual owners through junctions, file symlinks,
  hardlinks, 8.3/long and DOS/extended path aliases, and different
  `XDG_STATE_HOME` roots. The correction must jointly settle physical authority
  identity and rendezvous location before SQLite is opened.
  Commit `7abeeac3a` separately corrected the original false rollback wording
  from “made no migration attempt” to the truthful claim that failed
  initialization committed no database initialization; it belongs to the Gate
  6 provenance even though it does not repair runtime ownership.
- Gate 7 is closed under
  `docs/research/opencode-fork-gate-07-course-view-authority-2026-07-15.md`.
  The first native learning authority now owns independent Courses, stable View
  identity, immutable linear revisions, Course-owned item continuity, exact
  mappings, bounded reads, and nullable versioned working selection without
  importing Session, material, learner-record, Agenda, context, or model-tool
  settlement semantics. It depends on Gate 6's still-valid database and
  migration lineage, not its lease algorithm. Production consumption remains
  blocked until Gate 6 restores the one-owner runtime invariant.
- Gate 8 has not begun and is paused until Gates 4–6 close again.
- The former Gate 7–19 contracts never began and are superseded rather than
  reordered. Gate-based engineering remains the accepted progress and
  acceptance form. The post-Gate-6 architecture and roadmap grill settled the
  native learning skeleton and dependency-guided replacement Gate 7–17
  sequence; each Gate is still grilled again before implementation. The
  original infrastructure-first progression failed to carry the accepted
  Course, material, learner, Agenda, and Tutor data meanings into a coherent
  native product path. The corrected
  `docs/architecture/01-native-learning-data-model.md` makes Course
  LearnerHome-owned, permits several ongoing Courses, separates an optional
  default context preference from Course lifecycle, and gives each Course one
  exact versioned working View Revision among retained alternatives and
  history. Roadmap 09 now derives Course/View authority, command settlement,
  source and content authority, readable representations, material alignment,
  learner continuity, context, adaptation, Agenda, and assignment planning as
  explicit structural Gates without turning their supporting mechanics into
  independent product goals.
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
  composition, several ID-specific behaviors, recommendation, and retry upsell
  while preserving neutral explicit custom providers and the directly testable
  dormant provider implementation. The later audit found that request headers,
  native eligibility, CLI login/list/picker presentation, and CORS still retain
  first-party semantics, so this commit did not complete Gate 5's provider
  boundary. `0daeb6de5` removed the commercial retry action from the current
  status schema, OpenAPI, and v2 SDK.
- Automatic account/share/sync behavior, OpenCode service requests, hosted UI
  proxying, remote routes/selectors, and misleading TUI affordances remain
  disconnected by the earlier 5B, 5C, and 5D commits recorded in the Gate 5
  document.
- Web/Desktop, marketplace, hosted GitHub automation, first-party commercial
  provider policy, and updater implementation may remain hibernated. Runtime
  reachability is corrected. `25e51861e` moved all 26 inherited workflow
  definitions out of GitHub's active registration directory without changing
  their contents. The hibernated set includes build/deploy/publish behavior,
  upstream community-governance bots, hosted Agent/review entry points,
  repository-writing generation jobs, and CI tied to upstream branches,
  runners, and package scope. Designing Repa-owned CI is a later engineering
  decision, not part of Gate 5.
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
