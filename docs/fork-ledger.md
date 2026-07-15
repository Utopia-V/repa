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

| Gate                                     | Result                                                                                                                                            | Fork commit                                                                             | Historical record                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 0. Oracle freeze                         | Pre-fork behavior and assets classified                                                                                                           | pre-fork lineage                                                                        | `docs/roadmap/09-one-time-opencode-fork-baseline.md` at the oracle tag                |
| 1. Lineage                               | Exact full-history `v1.17.18` fork with MIT provenance                                                                                            | `b1fc8113948b518835c2a39ece49553cffe9b30c`                                              | `docs/research/opencode-fork-gate-01-lineage-2026-07-13.md`                           |
| 2. Windows baseline                      | Preserved inherited invalid PowerShell test failure                                                                                               | exact upstream tree                                                                     | `docs/research/opencode-fork-gate-02-pristine-windows-baseline-2026-07-13.md`         |
| 2A. Test correction                      | Corrected only the invalid shell test contract                                                                                                    | `a72f507de45788f3fb8556d883cdad919f33db43`                                              | `docs/research/opencode-fork-gate-02a-deterministic-windows-shell-test-2026-07-13.md` |
| 3. Repa identity                         | Independent binary, paths, config, runtime variables, and database filename; no OpenCode-state fallback                                           | `0ffed9f62159b5383b62da73bd270de7f8775e09`                                              | `docs/research/opencode-fork-gate-03-repa-identity-isolation-2026-07-13.md`           |
| 4. Learning-first composition            | Protected released-v1 Repa composition; the hidden-keyed internal-call close claim was later audit-invalidated                                    | `9c7b74f41c6090bc0fa0499c4b1345fa438f0ca6` + `17e25eab2784b8bd71bef7a91effb9ae352bf0ae` | `docs/research/opencode-fork-gate-04-learning-first-composition-2026-07-14.md`        |
| 5. Inherited product-surface disposition | Recorded terminal-only close; later audit preserved valid disconnections but invalidated v2/provider/CORS completion                              | `25e51861effbddbdb04ae8fe88c4107d34ab91b2`                                              | `docs/research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md` |
| 6. Native database admission             | Native Repa database identity and forward lineage; the concrete single-owner implementation claim was later audit-invalidated                     | `6c0b7aa5b`                                                                             | `docs/research/opencode-fork-gate-06-native-database-admission-2026-07-14.md`         |
| 7. Course and Course View authority      | LearnerHome-owned Courses, stable View identities, immutable revisions and mappings, exact working selection, and reversible versioned withdrawal | `3bd6eb9d4`                                                                             | `docs/research/opencode-fork-gate-07-course-view-authority-2026-07-15.md`             |

Read a historical record with:

```powershell
git show repa-prefork-oracle:<historical-record-path>
```

## 2026-07-15 post-Gate-7 audit provenance

Current disposition is owned only by `docs/README.md`. This section records the
dated findings that invalidated or preserved earlier completion evidence; it is
not another live Gate-status map.

- The audit invalidated Gate 4's internal-call close claim. Public admission
  could name a hidden primary Agent while request preparation treated `hidden`
  as authority to discard the interactive Repa composition. It preserved the
  released-v1 composition spine and assigned the inherited public v2 prompt
  registration to Gate 5 rather than authorizing a second Gate 4 runtime.
- The audit preserved Gate 5's reachability-over-deletion policy and its valid
  account/share/sync/updater/workflow disconnections, but invalidated its
  completion evidence. It found production v2 prompt admission that schedules
  model execution, provider-ID request/native/CLI privileges, and an automatic
  `https://*.opencode.ai` CORS grant.
- The audit preserved Gate 6 database admission and forward migration lineage,
  but invalidated its runtime-owner evidence. Two-process probes found dual
  owners through junctions, file symlinks, hardlinks, 8.3/long and
  DOS/extended path aliases, and different `XDG_STATE_HOME` roots. The failed
  implementation identified a resolved path string and rendezvoused below a
  process-selected state root. Commit `7abeeac3a` separately corrected the
  original false rollback wording from “made no migration attempt” to the
  truthful claim that failed initialization committed no database
  initialization.
- The audit did not invalidate Gate 7's Course/View contract, schema,
  migration, implementation, or focused evidence. It established that Gate 7
  depends on Gate 6's database and migration lineage rather than its concrete
  lease algorithm, while runtime use of any database authority still requires
  the one-owner invariant.
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

## 2026-07-15 Gate 6 runtime-owner correction provenance

Current disposition remains owned only by `docs/README.md`. This section records
the evidence that answered the audit finding above.

- `9cc3fe17f` selected a retained-main-connection design, but its original
  mutation-free-open claim failed crash-state review. `d7855d4ce` accepted the
  corrected bounded-recovery contract: plainly foreign clean files refuse
  before SQLite open, while ambiguous hot-journal/WAL sets may undergo only
  SQLite pager recovery before admission on the same retained connection.
- `16fcb3177` replaced the path-string/state-root lease with stable local-target
  preflight and one exclusive SQLite connection retained for all database use.
  Directory junction, file symlink, available 8.3, long, and DOS/extended
  spellings converge; hardlinks, recognized remote targets, and ordinary
  `:memory:` runtime materialization refuse. Fresh identity commits in rollback
  mode before WAL, and the no-query database shell no longer launches a second
  `sqlite3` connection behind Repa ownership.
- Crash probes covered non-zero identityless baseline cache spill with a hot
  journal, committed Repa WAL, and foreign WAL. Real two-process probes covered
  concurrent missing creation, the missing-to-existing handoff, different
  `XDG_STATE_HOME` roots, supported aliases, orderly release, and abrupt death.
  Real CLI evidence covered clean foreign refusal, `:memory:`, query/shell
  behavior, server ownership with `run --attach`, and local `pr` launch.
- Fresh focused verification passed 34 Core tests with 213 assertions and 16
  OpenCode tests with 79 assertions. Core and OpenCode typechecks, the migration
  generator check, formatting, and diff checks passed. The nine Gate 7
  Course/View tests passed as a dependency smoke check without reopening Gate 7.

## 2026-07-15 Gate 6 second post-close audit provenance

Current disposition remains owned only by `docs/README.md`. This audit
invalidated the close claim recorded for `16fcb3177` and `0a72caf73`, while
preserving their evidence for unaffected behavior.

- An arbitrary empty or stale journal/WAL/SHM sidecar allowed a clean non-empty
  identityless SQLite file to pass physical preflight; the no-user-table
  migration heuristic then initialized it as Repa. Green focused tests had not
  paired clean foreign fixtures with independently supplied sidecars.
- A final file symlink to a missing target made the main file follow the target
  while SQLite named WAL beside the unresolved alias. Abrupt termination could
  therefore strand committed state. Existing alias evidence created the file
  before the symlink and did not exercise this missing-to-existing transition.
- The audit left retained-connection locking, resolvable aliases, hardlink,
  remote and ordinary `:memory:` refusal, attach-only clients, Gate 6 migration
  lineage, and Gate 7's Course/View work unchallenged. Gate 7's production
  runtime prerequisite is nevertheless pending until the admission/identity
  correction is proven.

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
