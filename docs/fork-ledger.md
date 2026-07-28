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

## Gate close evidence

The commits and explicitly frozen working-tree snapshots below are the
historical acceptance points. They do not override the current disposition in
`docs/README.md`; a later audit may preserve the implementation evidence while
reopening one bounded completion claim.

| Gate                                     | Result                                                                                                                                            | Fork evidence                                                                           | Historical record                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 0. Oracle freeze                         | Pre-fork behavior and assets classified                                                                                                           | pre-fork lineage                                                                        | `docs/roadmap/09-one-time-opencode-fork-baseline.md` at the oracle tag                |
| 1. Lineage                               | Exact full-history `v1.17.18` fork with MIT provenance                                                                                            | `b1fc8113948b518835c2a39ece49553cffe9b30c`                                              | `docs/research/opencode-fork-gate-01-lineage-2026-07-13.md`                           |
| 2. Windows baseline                      | Preserved inherited invalid PowerShell test failure                                                                                               | exact upstream tree                                                                     | `docs/research/opencode-fork-gate-02-pristine-windows-baseline-2026-07-13.md`         |
| 2A. Test correction                      | Corrected only the invalid shell test contract                                                                                                    | `a72f507de45788f3fb8556d883cdad919f33db43`                                              | `docs/research/opencode-fork-gate-02a-deterministic-windows-shell-test-2026-07-13.md` |
| 3. Repa identity                         | Independent binary, paths, config, runtime variables, and database filename; no OpenCode-state fallback                                           | `0ffed9f62159b5383b62da73bd270de7f8775e09`                                              | `docs/research/opencode-fork-gate-03-repa-identity-isolation-2026-07-13.md`           |
| 4. Learning-first composition            | Original three-purpose close plus corrected composition authority and Gate 11 `representation` carrier                                            | original `9c7b74f41` + `17e25eab2`; corrected close `df61b7adb6c6e2c3f5f7fb46bee3109d0e16b05c` | `docs/research/opencode-fork-gate-04-learning-first-composition-2026-07-14.md`        |
| 5. Inherited product-surface disposition | Valid inherited-surface disconnections plus corrected v2/provider/CORS completion                                                                 | original `25e51861effbddbdb04ae8fe88c4107d34ab91b2`; corrected close `86332c24651c1222339624704496fae2dd27be10` | `docs/research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md` |
| 6. Native database admission             | Native Repa database identity, forward lineage, hardened admission, and restored single-owner runtime boundary                                    | original `6c0b7aa5b`; corrected implementation `34588b04182761e1afaaa80bd3cab6b48929cd9f`; close `6ad48455ee8dc4695e19ed9e28e88dfe43adade7` | `docs/research/opencode-fork-gate-06-native-database-admission-2026-07-14.md`         |
| 7. Course and Course View authority      | LearnerHome-owned Courses, stable View identities, immutable revisions and mappings, exact working selection, and reversible versioned withdrawal | `3bd6eb9d4`                                                                             | `docs/research/opencode-fork-gate-07-course-view-authority-2026-07-15.md`             |
| 8. Learning-command settlement           | Stable admitted occurrence, physical replay, causal receipt, exact Course acceptance settlement, and Session lifecycle closure                    | `293ff6892`                                                                             | `docs/research/opencode-fork-gate-08-learning-command-settlement-2026-07-16.md`       |
| 9. Source and Artifact authority         | Stable Artifact identity, exact observed revisions, location/availability history, provenance, and correction without retargeting                 | `41db7c292aaeb83abfafea9236480d006ccabe0f`                                              | `docs/research/opencode-fork-gate-09-source-artifact-authority-2026-07-16.md`         |
| 10. Content-root authority               | Approved root identity, bounded observation, separate mutation authority, project-origin quarantine, and exact Gate 9 admission                   | `fb6ed5763ecaa4a95a32ba7f6f352f3dc9794fef`                                              | `docs/research/opencode-fork-gate-10-content-root-authority-2026-07-17.md`            |
| 11. Readable representation lineage      | Immutable readable derivations, exact source proof, truthful conversion/current-use/failure semantics, and bounded managed reads                  | `bdbfa0c05322244d405fa26425c04eb7ceb9c9f0`                                              | `docs/research/opencode-fork-gate-11-readable-representation-lineage-2026-07-17.md`   |
| 12. Durable Turn lifecycle               | Finite learner/delegated Turns with exact model/tool membership, budgets, child lineage, terminal truth, and recovery                             | `80f5fa30a22e3e0628cd4a05e2880063a1f8eb2d`                                              | `docs/research/opencode-fork-gate-12-durable-turn-lifecycle-2026-07-18.md`            |
| 13. Material Map and Course alignment    | Immutable revision-bound material outlines and exact selectors plus optional neutral alignment to exact Course membership                         | `5e762f8336b33d7d8365c9bc9204b52f52eba114`                                              | `docs/research/opencode-fork-gate-13-material-map-alignment-2026-07-19.md`            |
| 14. Learner navigation continuity        | Learner-controlled default Course preference and independent exact per-Course route anchors with append-only correction and command provenance    | `a6b542d59879f0a4b1111eaef4ad23e446b473d0`                                              | `docs/research/opencode-fork-gate-14-learner-navigation-continuity-2026-07-19.md`     |
| 15. Retained scoped steering             | Source-linked, scoped, versioned, correctable Tutor-policy state with an exact immutable model-operation cut                                      | `03ea74ec4f760c83060a6da4fa26ecb9519d1468`                                              | `docs/research/opencode-fork-gate-15-retained-scoped-steering-2026-07-20.md`          |
| 16. Learner Goal authority               | Learner-owned Goal identity, revision, correction, optional target semantics, and explicitly authorized lifecycle meaning                         | `69433fc78d383bade1d92319eb3153a2cd7c68bd`                                              | `docs/research/opencode-fork-gate-16-learner-goal-authority-2026-07-21.md`            |
| 2026-07-28 cross-Gate correction         | Gate 5/6/8/10/11/14/15 scoped repairs plus Gate 16 TUI repair, authority reconstruction, and inherited-control retirement                         | `9e91d43c629b66d65c8741e342bca7cf05de5667`                                              | `docs/research/pre-gate-17-global-hazard-audit-2026-07-27.md`                         |

Gate 0–3 records and other pre-fork evidence live only in the immutable oracle:

```powershell
git show repa-prefork-oracle:<oracle-record-path>
```

Gate 4 and later records live in the current fork and are read directly from
the paths in this table. Do not route current-fork records through the oracle.

## 2026-07-17 post-Gate-10 global roadmap audit provenance

Current Gate disposition remains owned only by `docs/README.md`. Read-only
top-level audit task `019f6e92-ec9f-71a2-80d8-3a0d887ca6aa` re-read the product
foundation, accepted ADRs, both architectures, roadmap, ledger, Gates 0–10
evidence, current implementation, and working tree. It did not read or judge a
Gate 11 draft.

The maintainer accepted these durable roadmap corrections:

- Gates 0–10 remain closed, and Gate 11 keeps its readable-representation
  number and boundary. Its owner-led grill may proceed to contract writing.
- The unstarted route after Gate 11 is replaced by Gates 12–23: durable Turn,
  Material Map/alignment, navigation continuity, retained steering, Learner
  Goal, natural-language bootstrap, learning Context/continuation, first
  learner adaptation, source-linked future attention/Tutor return, Assignment
  planning, terminal inspect/correct, and the integrated product loop.
- First ordinary learner input atomically admits Session+Turn through the
  Durable Turn boundary; OpenCode's inherited sessionless navigation does not
  become a duplicate Gate.
- Default Course preference belongs with route-anchor navigation continuity;
  Context only reads it. Goal, future attention, and Assignment remain separate
  meanings. Future-attention lifecycle and Tutor service form one vertical
  Gate; generic commitment, deferral, and durable detour/rejoin remain
  consumer-earned future details.
- Evidence is routed by claim: deterministic/fault evidence for authorities,
  native-provider qualification for accepted model behavior, and a bounded
  pre-contract experiment only when its result can change ownership,
  representation, or control policy. Learner adaptation and multi-day
  Assignment planning retain explicit experiment admission conditions.
- Source/runtime lineage cutover is complete. Final product-loop acceptance and
  recurring release readiness are separate; no new Cutover Gate or standalone
  real-provider Gate is introduced.
- Selective cross-authority deep deletion has a named post-baseline Data
  Lifecycle owner. It remains recorded, requires exact impact preview and
  explicit learner authorization, and does not block the first planned product
  boundary.

Historical Gate numbers and evidence are not renumbered. `2A` remains the
honest corrective insertion after Gate 2 rather than a reason to relabel the
old route by an inferred Gate count.

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

## 2026-07-15 Gate 5 correction-grill provenance

Current disposition remains owned only by `docs/README.md`. This section
records the source inspection, the maintainer's v2-preservation correction,
and the agent-derived Gate 5 correction contract. Independent top-level
reviewer task `019f6599-2914-7f02-849d-412862338271` first returned `Revise`,
then accepted the corrected contract and closed the theory round. The same
reviewer later accepted the implementation and evidence; the closing facts are
recorded separately below.

- At the audited pre-correction state, the shared v2 Session protocol exposed
  `active`, `prompt`, `compact`, `wait`, and `interrupt`. `prompt` admitted
  durable input and could wake the preview runner; the other operations exposed
  the same coordinator or advertised unavailable execution behavior. Both
  production server assemblies installed
  the live local v2 execution layer, and the default Location service map also
  registered `SessionRunnerModel` and `SessionRunnerLLM`. The accepted contract
  removed this whole execution family, its process-global
  coordinator, and its Location-scoped runner services from production
  composition while retaining the implementation, declarations, runner-enabled
  non-production composition, and direct tests as compile-checked hibernated
  source for a later evidence-based OpenCode-v2 comparison.
- Released provider discovery and CLI paths could bypass the filtered catalog,
  while request and native-runtime branches privileged IDs beginning with
  `opencode`. Credential list/logout also used the raw catalog for commercial
  names, environment discovery, and name matching. The accepted correction uses
  one outward projection that filters only the inherited exact built-ins before
  overlaying explicit configuration; custom IDs such as `opencode` or
  `opencode-local` remain ordinary, while no-config legacy credentials remain
  manageable by literal ID.
- The inherited CORS owner granted not only `https://*.opencode.ai` but also
  Desktop and Tauri origins implicitly. The dormant Desktop sidecar already
  supplied its required origin explicitly, so the correction removed ambient
  client-name grants while preserving no-Origin, localhost, same-host, and
  exact configured-origin rules. No Desktop source deletion follows.

## 2026-07-15 Gate 5 correction-close provenance

Current disposition remains owned only by `docs/README.md`. The same top-level
reviewer task accepted the implementation/evidence round with no P0–P3 finding
after reading the original working tree rather than its stale review worktree.

- Production Protocol, handlers, OpenAPI, and current generated clients expose
  none of the five preview-v2 execution operations. Both production server
  assemblies use the non-executing Session layer, and the production Location
  graph contains neither runner service. The declarations, handlers, runner,
  explicit non-production runner composition, and direct tests remain as
  compile-checked hibernated source. Released-v1 execution and retained v2
  reads and non-executing state transitions remain.
- One outward provider projection excludes only the exact inherited raw
  `opencode` and `opencode-go` built-ins before overlaying explicit providers.
  HTTP discovery and every registered provider/model/credential CLI surface
  consume that projection. ID-derived request headers, native eligibility,
  recommendation, ordering, and `Free` presentation are gone; explicit
  `opencode`, `opencode-local`, and control providers remain ordinary custom
  providers, while an orphan credential remains manageable by literal ID.
- Ambient `*.opencode.ai`, `oc://renderer`, and Tauri CORS grants are gone.
  No-Origin, loopback, same-host, and explicit configured origins remain; the
  dormant Desktop owner supplies `oc://renderer` explicitly. The previously
  accepted updater disconnection and hibernated implementation were unchanged.
- Fresh evidence passed seven affected package typechecks, six production and
  hibernated Location tests, the direct runner and released-v1 prompt oracles,
  the retired-route/no-admission oracle, 24 public-OpenAPI tests, 12 current
  client tests, two retained sdk-next behavior tests, 176 focused
  provider/request/native/CLI tests with six existing skips, six CORS tests,
  and four real credential-command subprocess tests. Exact production-owner
  scans and `git diff --check` passed. Official generator success was checked
  against the resulting artifacts and their focused tests and typechecks.
- Broader cassette drift, the deliberate two-host/one-database owner refusal,
  dormant-plugin asynchronous-key assertions, and pre-existing whole-file
  formatting debt were inspected and did not contradict a Gate 5 claim. No
  unrelated monorepo-wide suite was used as a closing ritual.

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
  runtime prerequisite was nevertheless pending until the admission/identity
  correction below was proven.

Resolution provenance:

- `34588b041` removed the caller-supplied initialization classification and the
  no-user-table freshness heuristic. Only a post-recovery zero-page database
  with zero application identity and user version may initialize.
- The same commit distinguishes an absent path from a dangling final file
  symlink and rejects the latter before SQLite open, while preserving supported
  resolvable aliases.
- The focused Core authority/migration evidence passed 27 tests with 158
  assertions; the real owner-process evidence passed four tests with 47
  assertions. Core and OpenCode typechecks, formatting, and diff checks passed.
  Current Gate disposition remains owned by `docs/README.md`.

## 2026-07-15 Gate 4 correction-grill provenance

Current disposition remains owned only by `docs/README.md`. This section
records correction provenance. Independent review run
`gate4-20260715-authority-01` accepted both the contract/theory and
implementation/evidence layers after the corrections described below. Closing
facts are recorded separately at the end of this section.

- The original Gate 4 checkpoints established the protected Repa interactive
  composition and learning-first prompt/profile work, but request preparation
  used `agent.hidden` to choose between interactive and internal composition.
  The original contract and focused tests encoded the same assumption, so their
  green result could not detect the authority error.
- After Gate 5 stabilized production reachability, the released-v1 carrier
  audit found that public HTTP, `repa run`, commands, Task delegation, and
  Session/ACP recovery can all reach request preparation with a caller-selected
  or persisted Agent. A hidden primary Agent or hidden subagent therefore
  received the internal contract without a program-owned operation purpose.
- The registered hidden `summary` primary profile is a real interactive carrier
  when explicitly named. There is no automatic/program-owned internal summary
  caller. The closed released-v1 stream-purpose set is title generation,
  context compaction, and project-copy naming; the dedicated `Agent.generate`
  method and fixed generation system remain a separate structured-output owner.
  Preview-v2 and hosted GitHub model code remain hibernated outside the
  production carrier set.
- The derived correction makes every admitted Agent-driven sample interactive
  regardless of `hidden`, preserves hidden as discovery/default presentation,
  and requires each stream-internal owner to provide an in-process purpose with
  a fixed semantic contract. `Agent.generate` keeps its dedicated owner.
  Existing model and provider tuning may remain operational inputs; Agent
  names, prompts, modes, configuration, plugins, public payloads, and persisted
  messages cannot create or replace internal authority.
- Internal operations admit no executable Agent/domain tools. A provider may
  receive only a reserved non-executable wire declaration when replay history
  requires it, paired with `toolChoice: none` and no executor. Title skips
  before sampling when its optional profile is unavailable; fresh and recovered
  compaction markers fail explicitly before sampling and remain recoverable;
  neither substitutes the default interactive Agent.
- A resolvable persisted Agent remains the selected interactive Agent. A
  missing or disabled Agent fails before sampling with no silent fallback. This
  follows the existing exact-steering and correction principles rather than a
  new maintainer preference.

Independent review run `gate4-20260715-authority-01` returned `Revise` for its
contract/theory layer. It found four contract defects: `summary` was wrongly
called dormant despite explicit interactive admission; `Agent.generate` was
both preserved as a dedicated owner and required to carry a stream purpose;
internal profile-loss and recovered-compaction semantics were undefined; and
literal zero-tool language conflicted with Copilot replay transport. The same
reviewer closed all four after the draft repaired those meanings.

That closure pass returned `Revise` again because accepted ADR-0014 still
classified summary and helper Agents as hidden internal calls. The ADR now
states the corrected authority boundary: admitted Agent-driven samples are
interactive; only trusted call origin selects the three stream purposes;
`Agent.generate` retains its dedicated owner; and no automatic internal summary
owner exists. The same reviewer closed that fifth finding and accepted the
contract/theory layer of run `gate4-20260715-authority-01`. The accepted
implementation replaces `hidden`-derived authority with a
closed call-origin purpose union, gives missing Agent resolution a truthful
optional type, binds the three real internal owners, preserves the dedicated
`Agent.generate` owner and explicit hidden-summary interaction, and makes the
Copilot replay declaration non-executable.

The first implementation/evidence pass of that same review run returned
`Revise` with four new findings. A GitLab Workflow model could install and use
its own privileged executor/approval bridge before the downstream tool-call
guard; TUI and ACP exact selectors still rejected hidden primary Agents; an
ordinary recovered missing Agent was resolved after the title fiber started;
and the promised title retry after a temporarily disabled profile was
unreachable. The repaired implementation moves all four boundaries to admission:
Workflow models fail before their bridge or sampling in the three stream
purposes and independently in the dedicated `Agent.generate` owner,
presentation lists remain filtered while exact primary-Agent identity remains
selectable, ordinary Agent resolution precedes ordinary sampling while
recovered compaction keeps its independent owner, and default-title state
permits one deduplicated later attempt after the profile returns.

The implementation/evidence closure pass closed all four findings above but
returned `Revise` for one related title race. The asynchronous owner still used
a run-start Session snapshot, so a later loop could retain default-title
eligibility across guard removal, start a second provider sample, and overwrite
a newer manual rename. The repaired implementation now reads persisted eligibility
before scheduling and at job start, while the Session authority serializes
manual and conditional writes by Session ID and commits generated text only if
the persisted title remains default.

Re-review confirmed the original stale-snapshot/manual-rename path was repaired
but found that every `session.updated` patch still projected a full Session row.
Because only explicit title methods used the lock, an earlier `touch`, metadata,
permission, or other non-title snapshot could publish afterward and restore the
default title. The lock now belongs to the common patch transition and covers
its read, snapshot construction, and publication; the conditional title writer
checks and invokes the unlocked internal patch while holding that same lock.

The retained reviewer accepted the following causal evidence rather than a
generic confidence claim:

- OpenCode, Plugin, and TUI package typechecks pass.
- The complete compaction file passes 54 tests with one intentional v2 skip;
  ACP directory/session tests pass 39 checks, and the local-context TUI file
  passes three. Focused request-composition, hidden prompt, carrier-audit,
  title/profile recovery, Agent-resolution, Task, and real Copilot replay
  checks pass.
- Real `GitLabWorkflowLanguageModel` refusal oracles for the stream-purpose and
  dedicated generation owners observe no provider network request, Permission
  ask, executor call, or file write; the stream oracle also confirms that the
  cached model's prior mutable callbacks were not replaced before failure.
- A six-test prompt counterexample set passes 28 assertions. Its first causal
  race oracle holds the first title across a completed ordinary loop, admits a
  later loop and manual rename, waits until the conditional write discards the
  generated value, then proves a subsequent loop neither samples again nor
  overwrites the learner title. A second publication barrier holds `touch` after
  it has built a default-title snapshot, proves the conditional writer cannot
  escape the common patch lock, releases both transitions, and confirms the
  generated title survives without a later title sample.
- The deterministic source audit finds exactly three internal-purpose call
  sites (`title`, `compaction`, and `project-copy-name`), one ordinary
  interactive processor call, no `summary` purpose, and no public composition
  selector.
- At implementation review, a broader `session/llm.test.ts` probe passed 24
  tests while four custom nested-runtime cases stopped on Gate 6 database
  ownership before their LLM assertions. That result was preserved as a
  verification-boundary observation rather than promoted into Gate 4 evidence;
  the post-close fixture correction below later resolved it.

## 2026-07-16 Gate 4 correction-close provenance

Current disposition remains owned only by `docs/README.md`. The same top-level
reviewer accepted the whole-Gate implementation/evidence layer after closing
`G4-IE-001` through `G4-IE-005`; `G4-CT-001` through `G4-CT-005` remain closed.
No new P0–P3 finding remained.

- Every admitted Agent-driven released-v1 call now receives interactive Repa
  composition regardless of `hidden`. Only trusted title, compaction, and
  project-copy-name call origins select the narrow stream contract;
  `Agent.generate` keeps its dedicated fixed structured-output owner.
- Internal operations reject GitLab Workflow models before executor,
  preapproval, permission, provider, or file-write activity can begin. Copilot
  replay may retain only the accepted non-executable wire declaration with
  `toolChoice: none`. Explicit hidden primary Agents remain selectable in TUI
  and ACP while staying absent from ordinary discovery and cycling.
- Recovered ordinary Agents resolve before any ordinary sample; recovered
  compaction markers remain under their own owner. Disabled title profiles skip
  without sampling and may retry once later while the Session title remains the
  default. Every full-row Session patch and conditional/manual title write now
  shares one per-Session serialization owner, so stale loop or patch snapshots
  cannot duplicate title sampling or overwrite a newer non-default title.
- Fresh closure evidence passed six prompt counterexamples with 28 assertions,
  the complete Session test file with seven tests and 25 assertions, OpenCode
  typecheck, `git diff --check`, and a production-source audit showing one
  full-row Session-update publisher with no bypassing patch path. Previously
  accepted unchanged focused evidence covers Workflow and Copilot refusal,
  ACP/TUI carriers, compaction, composition authority, and affected package
  typechecks.
- At closing review, the broader `session/llm.test.ts` observation was still
  explicitly non-green: 24 tests passed and four custom nested-runtime cases
  stopped at the Gate 6 database-owner boundary before their LLM assertions.
  It was not required for acceptance, and no unrelated monorepo suite or live
  external-provider traffic was promoted into Gate 4 evidence. The following
  test-only correction supersedes that evidence state without changing either
  Gate contract.

## 2026-07-16 post-close LLM test-fixture correction

Current Gate disposition remains owned only by `docs/README.md`; neither Gate 4
nor Gate 6 reopened. Four `drainWith` cases intentionally created a second LLM
runtime but inherited the ordinary outer runtime's `REPA_DB`, so Gate 6
correctly rejected their second physical owner before the intended LLM
assertions.

- The nested custom LLM layers now explicitly replace `Database.node` with
  `Database.layerFromPath(":memory:")`, the process-private injection reserved
  for tests. The ordinary outer test runtime still exercises the real file
  database and Gate 6 ownership behavior.
- The four formerly blocked AI SDK/native cases pass directly. The complete
  `session/llm.test.ts` file passes 28 tests with 81 assertions; OpenCode
  typecheck, formatting, and diff checks pass.
- No `DatabaseBusyError` is caught or ignored, and no production database or
  admission code changed. The correction makes the test topology truthful
  rather than weakening the single-owner invariant.

## 2026-07-16 Gate 8 close provenance

Current disposition remains owned only by `docs/README.md`. Original top-level
reviewer task `019f68d9-5853-7e23-8592-dc41b90ac9bb` accepted both the
contract/theory and implementation/evidence rounds after every requested change
was returned to that same reviewer and closed. Implementation provenance is
fixed by commit `293ff6892`.

- The Core learning-command authority persists immutable admitted learner
  occurrence lineage, physical invocation identity, Course-owned semantic
  effect identity, exact results and receipts, source-unavailable tombstones,
  replay/conflict order, and the first non-null Course View Revision acceptance
  in one domain/result settlement.
- The released-v1 runtime binds trusted model operation, Part/call identity,
  canonical input, permission, time, and causal source before mutation. Its
  common local-tool FIFO, two-transaction permission flow, durable recovery,
  and post-commit reconciliation return one exact stored outcome without a
  second runner or event system.
- Session occurrence admission, transcript mutation, compaction, fork, revert,
  provider completion, and deletion now share the lifecycle boundaries needed
  to keep durable invocation and presentation truth consistent. Whole-Session
  deletion closes before late publishers, while admitted Runner cleanup may
  re-enter the same Session under a retained read lease and still drain to a
  permanently closed phase.
- Focused reviewer evidence exercised migration and fresh-schema equivalence,
  Course CAS/ABA, Event commit/rollback/visibility, exact replay and conflict,
  permission and crash recovery, processor interruption, HTTP and generated
  protocol behavior, transcript mutation, compaction/fork/revert/deletion, and
  deterministic lifecycle races. Core and OpenCode typechecks, the migration
  generator, formatting, link, and diff checks passed. The final reopened
  lifecycle boundary passed 31 Lifecycle/Runner tests with 90 assertions plus
  the real prompt interleaving with seven assertions.
- Windows-only real shell execution remained platform-skipped and was not
  reported as green. Both shell and ordinary runner entry use the same handoff,
  while direct Runner shell cancellation/Stopping evidence and the real Runner
  cleanup oracle covered the relevant invariant. No unrelated monorepo-wide
  suite or later Gate work was required for acceptance.

## 2026-07-16 Gate 9 review acceptance provenance

Current disposition remains owned only by `docs/README.md`. Original top-level
reviewer task `019f6ae7-fff2-7800-9d7b-023cf918e201` accepted both the
contract/theory and implementation/evidence layers of review run
`gate9-contract-406beb29cd4e4ec4bb24725fb4d103f8` after every requested change
returned to that same reviewer and closed. The accepted contract/theory snapshot
had SHA-256
`ffff7b05196e6e167383aa937b525969d7a81e593de805aa5094fa50ddeb5be0`.
Implementation provenance is fixed by commit `41db7c292`.

- The review closed `G9-C01`–`G9-C08`: exact point and suffix correction,
  non-byte Observation correction, source availability versus exact-Revision
  resolvability, truthful startup-corruption scope, bounded active-location
  lookup, atomic correction across binding episodes, unbounded finite correction
  histories, and rejection of cross-admission merging through a fresh target.
- It closed `G9-E01`–`G9-E02` by recording exact source provenance and expanding
  the implementation evidence contract around the accepted counterexamples.
- The final reviewer pass found no open acceptance-changing issue, reran document
  integrity checks against frozen bytes, and left production and Git state
  unmodified.
- Contract acceptance did not authorize implementation. The maintainer
  separately authorized that layer on 2026-07-16, after which the same
  reviewer's first implementation pass returned `Revise` for `G9-I01`–`G9-I03`
  and coupled gaps `G9-E03`–`G9-E04`.
- The repair closure independently replayed superseded exact references,
  cross-recorded Revision attribution through history and fallback, and all four
  dangling lineage-boundary foreign-key failures. It closed every finding and
  accepted implementation/evidence with no replacement issue.
- Fresh closure evidence passed 13 Artifact tests with 133 assertions, 21
  migration tests with 86 assertions, and 11 adjacent learning-domain tests
  with 167 assertions. Core typecheck, migration-generation equivalence,
  production Artifact lint, source ownership, and diff checks passed. The
  optional broad Core campaign remained explicitly non-green and was neither
  required nor promoted into Gate evidence.
- The maintainer separately authorized integration after review acceptance.
  Commit `41db7c292` fixes the accepted implementation provenance;
  `docs/README.md` therefore closes Gate 9 without starting Gate 10.

## 2026-07-17 Gate 10 review acceptance provenance

Current disposition remains owned only by `docs/README.md`. Original top-level
reviewer task `019f6be4-ee6d-7722-b75f-a2426b6f9e36` accepted both the
contract/theory and implementation/evidence layers of review run
`gate10-whole-7d33ad2f934d4a01a459e0f7c741de4f`. Contract/theory required four
`Revise` passes before the fifth-pass `Accept`; implementation/evidence required
an initial `Revise`, one closure `Revise`, and the final `Accept`.
Implementation provenance is fixed by commit `fb6ed5763`.

- Contract review closed `G10-C01`–`G10-C04`: machine-user trust origin before
  every project-controlled effect, Gate 8-compatible manifest application,
  independently anchored mutation-grant lifecycle, and globally unique exact
  root binding/reapproval history.
- Implementation review closed `G10-I01`–`G10-I04` and `G10-E01`: one bounded
  search/inventory clock and cancellation path, non-bypassable exact one-shot
  confirmation, one durable approval per revocable mutation authority, faithful
  persisted verifier versions, and the six required real config/TUI consumer
  chains.
- The final closure independently replayed pre-aborted durable and one-shot
  writes, cancellation while confirmation was pending, cancellation after
  confirmation but before admission, and cancellation after admitted durable
  and one-shot writes. Pre-admission cancellation performed no write; admitted
  native mutation returned its real terminal result instead of detaching behind
  a cancelled result.
- Fresh reviewer closure evidence passed the four focused cancellation tests,
  all eight ContentRoot tool tests with 27 assertions, OpenCode typecheck, diff
  checks, and document integrity checks. The accepted author evidence also
  includes the 273-test Gate-scoped OpenCode suite, Core authority/migration
  evidence, all three affected package typechecks, migration equivalence, and
  the compiled Windows x64 ContentRoot native smoke recorded in the Gate record.
- The accepted implementation snapshot remained on
  `81b0b169ef746ea18bf3859e853307188e8f5e71` with working-tree changes. Key
  accepted SHA-256 values were
  `B075A1661397228DAF07316BAFE15A8A5ACDBF2DAD1AF2AC7BDB1BE04396DE85`
  for `packages/opencode/src/tool/content-root.ts` and
  `F9123AA300F9B18E7E1121927BCAE1F1C697F2F2310E3B29171266AD0A701E13`
  for its direct tool evidence. The reviewer left production and Git state
  unmodified.
- The maintainer separately authorized integration after review acceptance.
  Commit `fb6ed5763` fixes the accepted implementation provenance;
  `docs/README.md` therefore closes Gate 10 without starting Gate 11.

## 2026-07-18 Gate 11 review acceptance provenance

Current disposition remains owned only by `docs/README.md`. Retained top-level
reviewer task `019f6fbc-6afb-7b50-a0dd-53058fecf778` accepted both the
contract/theory and implementation/evidence layers of review run
`gate11-20260717-whole-01`. Contract/theory required three `Revise` repair
rounds before `Accept`; implementation/evidence required one `Revise` and one
closure `Accept`.

- Contract review closed `G11-CT-001`–`G11-CT-012`, including the Gate 4
  representation-purpose correction, exact Gate 9 attribution and Gate 10 read
  receipt, current-use admission, nonretroactive root revocation, secret-free
  provenance, independent read budgets, deletion recovery, packaged-child
  evidence, ordinary-use eligibility, bound producer output, and separation of
  source availability from semantic eligibility.
- Implementation review closed `G11-IE-001`–`G11-IE-003`: populated Gate 10
  migration under production foreign-key enforcement, typed producer
  cancellation/timeout/output failure through durable Gate 8 settlement, and
  exact-current packaged parent-to-child cancellation and cleanup.
- Fresh closure evidence passed 121/121 Core tests with 751 assertions across
  14 files, 180/180 OpenCode tests with 702 assertions across 10 files, both
  package typechecks, migration/schema equivalence, and `git diff --check`.
  The reviewer independently exercised both retained Windows mains through
  ContentRoot admission, exact PDF conversion, current-use read, and compiled
  main-to-worker cancellation with no surviving worker.
- The accepted x64 main/worker SHA-256 values are
  `8BA7D29E549B47475F7424A85F62931488E5C8B8966D7CC3D3EDC1799826AECC` and
  `1D2ADCCA72A034A8CC564E87FC80CCE5EE9903B5627B929344D5CDC59D933EBF`;
  baseline values are
  `A8F1B243D63769DE23144145BB15061DB4E182F0EB768FF8B7AD1F7A109B9234` and
  `D65C5385DF255E27A4911D50017E946260E0BD490BDD12367F81E14A5091730F`.
  Both package trees carry the same 207 non-executable asset/license files.
- The accepted closure snapshot remained at HEAD
  `8121d1d098914da947cb20b3e3f39b3afdac7121` on branch
  `codex/opencode-v1.17.18-baseline`. Its changed-file manifest SHA-256 was
  `197142CDD3741B5DF611B48BA8D935F69BBA23AB288CABF86777753C412EE80F`;
  the Gate record was
  `1E0677A608EF71D2BFE74F8CDCE03C2614869402E2636C19181022B1A20572F3`
  and Roadmap 09 was
  `8359C89FE4F24C0D3EEF8644BBFAB71A256FC9FF9D06C7C5D31CB4F5073A8703`.
  The latter preserved Gate 11 and the Gate 12/13 boundary.
- The unchanged secret-free real-provider projection remains
  `E8AFCAA8BF38FFF67C47BA3EFEDA2A21E3278497968C88509CFF07FC93B33C31`.
  Closure made no new provider, paid, or cloud call and did not inspect or rerun
  the external CS189 material. The reviewer left production, dist, and Git
  state unmodified and cleaned all reviewer-owned temporary state.
- The maintainer separately authorized integration after review acceptance.
  Commit `bdbfa0c05` fixes the accepted implementation provenance;
  `docs/README.md` therefore closes Gate 11 without starting Gate 12.

## 2026-07-19 Gate 12 review acceptance provenance

Current disposition remains owned only by `docs/README.md`. Retained top-level
reviewer task `019f7443-f008-7243-8016-f78b5ced55e7`, run
`gate12-20260718-whole-01`, accepted both contract/theory and
implementation/evidence. It closed `G12-CT-001`–`G12-CT-006` and
`G12-IE-001`–`G12-IE-008`; no maintainer-owned product decision was reopened.

- Contract review first returned `Revise` for six derived lifecycle
  corrections, then accepted the repaired fork materialization,
  admission-to-owner handoff, causal-input window, candidate-exhaustion,
  destructive-retention, and cross-Session frontier contracts.
- Implementation review first returned `Revise` for seven code/evidence
  findings. The same reviewer accepted the repaired handoff cancellation,
  deny-first delegated authority, SQLite immutability and learning-frontier
  constraints, exact visible-Turn targeting, destructive-lifecycle evidence,
  and reconciled packaged Windows provenance. It also disclosed and closed
  `G12-IE-008`, which makes fork chronology use durable `(created time, ID)`
  ordering so historical clone IDs cannot outrank a genuine newer root.
- Fresh closure execution passed Core Turn plus migration at 46 tests and 298
  assertions; the admission/handoff matrix at 8 and 50; delegated Task
  authority at 9 and 42; Message chronology at 37 and 63; atomic fork-start
  HttpApi at 1 and 13; and the exact TUI identity subset at 18 and 59. Core
  migration `--check` also passed. The reviewer accepted the deterministic
  A-to-B capture test as causally equivalent to pausing the same production
  seam under external ConPTY.
- The byte-ordinal build-source manifest records 169 paths and 4,752,171 bytes,
  has file hash
  `605F53CC6FF63A040E252DF5501EFEE681C5B307A9C124F0AA64E189F688AE58`,
  and has aggregate
  `F469C6186FDE5961D0100212097DA25C123EC597CFF821EC8365491C46695AD6`.
  The reviewer independently matched every non-document entry to the accepted
  source.
- The retained 209-file Windows package has aggregate
  `8FB179648E3E34ECF38DB9C24EB04E83A8AD3C57F9193A9204F608F15F943753`;
  its manifest hashes to
  `C8F122331B1B12A39DF3B6482496991CF16CC011AB14A4EE2B7618ABF16E1F02`
  and `repa.exe` to
  `C735FBFFF65A6326512A474340B0727A9DE83EFBD03F496146F3C735101A6F9A`.
  The accepted `ok: true` oracle consumed 12/12 provider requests and proves
  first admission, visible queue and steer, fork start, bounded child outcomes,
  typed unavailable-child projection, learner interrupt/exact replay, and
  startup recovery without provider redispatch or durable queued-draft replay.
- `oracle-report.json`, raw ConPTY, and normalized terminal output hash to
  `2DA0C4BF0F44B87B513686151938376BB84C434473266535ABDBF19D124A35CD`,
  `10F0F30BC0B3089E3A33BFCD2B7A93F37CD9D7D0AC9E65C3E813F73BAB53624B`,
  and `9058F51B90DC3CA54FBFF2C8A96CD9301AB6F83175557EC1F1779BDBEDAC8F83`.
  The exact oracle source is the sibling retained file
  `gate12-windows-packaged-evidence/oracle.ts`, not a child of the repaired
  artifact root, and hashes to
  `4AEE7EC8B144BD51EEA2D600CA6CAD0196921DC912E6182A95588CA6645B7BFD`.
- The independently accepted snapshot remained at HEAD
  `64a77fd3a6a3d13747f1312f029b9d4c48682752` on branch
  `codex/opencode-v1.17.18-baseline`, with 169 changed paths, raw status hash
  `77425AA8F88E501ADD80338DCB3AB7F4D0B800B1439666EB0A6A7DE36640A9B8`,
  and changed-content aggregate
  `BCFDC1FFA01872C1930D750447DEAD051502CC38BDFBD37ADE00F93EFD32E290`.
  At review close, `docs/README.md` and the Gate record hashed to
  `C2723616EC65519B55BEC8611B8A46FF7509C3C29DD3C591D7EEAAE73E4F9C82`
  and `1EA13FE10FAE0A6AA44AB16DB52621BDA7B2D84A7065A3582D8BB3F35A7C50FB`.
  The reviewer made no repository, retained-artifact, Git, credential, or
  external durable-system mutation.
- The maintainer separately authorized integration after review acceptance.
  Commit `80f5fa30a` fixes the accepted implementation provenance;
  `docs/README.md` therefore closes Gate 12 without starting Gate 13.

## 2026-07-19 Gate 13 review acceptance provenance

Current disposition remains owned only by `docs/README.md`. Retained top-level
reviewer task `019f7996-36e0-72e1-8429-9e7f0d8b57f0`, run
`gate13-whole-20260719-01`, accepted both contract/theory and
implementation/evidence. It closed `G13-CT-001`–`G13-CT-006` and
`G13-IE-001`–`G13-IE-003`; no maintainer-owned product decision was reopened
and no new acceptance-changing implementation defect remained.

- Contract review repaired exact Artifact source binding, Map-withdrawal
  current-use linearization, stable replay identity, Course-owned membership
  revalidation, media-correction lifecycle, and external selector provenance.
- Implementation review repaired the Representation capability boundary,
  Unicode Windows canonical-path-key persistence across the Gate 11 and Gate 13
  tables, and the AppLayer executable-carrier evidence claim.
- The accepted executor evidence passed 100 Core tests with 752 expectations
  across the affected Gate 7/9/11 owners and all Gate 13 suites, both package
  typechecks, migration `--check`, and document integrity checks. The reviewer
  independently reran the three repair-focused Core suites at 20 tests and 161
  expectations plus the AppLayer construction suite at 4 tests and 5
  expectations.
- No packaged release build or provider call was run or claimed. The focused
  AppLayer construction oracle covers the shared executable-composition change;
  packaging and provider surfaces remain outside this Gate's evidence claim.
- The independently accepted implementation/evidence snapshot remained at HEAD
  `461a1acc28b41550539496f58a5cedcb2339a583` on branch
  `codex/opencode-v1.17.18-baseline`, with tracked binary diff hash
  `79551428adcb103366d6cbf83401e2c9bf674d17`. At review close, the Gate record
  and `docs/README.md` hashed to
  `8360CC185E3E871197B2E43B1EF02C49AB2418D4D37EF096A94624DED8B4DF64` and
  `61DB6157E8625A3F34E9A8A69FE5B825E1B1993D29C8438EAFC7A74CF5270944`.
  The reviewer observed identical start/end bindings and made no repository,
  Git, credential, or external durable-system mutation.
- The maintainer separately authorized integration after review acceptance.
  Commit `5e762f833` fixes the accepted implementation provenance;
  `docs/README.md` therefore closes Gate 13 without starting Gate 14.

## 2026-07-20 Gate 14 review acceptance provenance

Current disposition remains owned only by `docs/README.md`. Retained top-level
reviewer task `019f7ace-da04-7b92-9b2a-722a236b1ba7`, run
`gate14-whole-20260719-01`, accepted contract/theory after closing
`G14-CT-001`–`G14-CT-005` and both nonblocking strengthenings. During
implementation/evidence review it closed `G14-IE-001`–`G14-IE-004` and raised
`G14-IE-005`; its final closure turn then ended in external `systemError` and
supplied no replacement verdict or closure authority.

- Independent replacement reviewer task
  `019f7bcb-a5b1-7612-a094-f093389a38cf`, run
  `gate14-replacement-20260720-01`, reviewed the complete implementation/evidence
  candidate, independently confirmed `G14-IE-001`–`G14-IE-005` resolved, and
  returned `Accept` with no acceptance-changing finding. Its sole finding,
  `G14-RR-001`, was low-severity review-status bookkeeping and was reconciled in
  the project-owned status documents before integration.
- The accepted evidence passed both affected package typechecks and migration
  `--check`; 27 database-migration tests with 163 assertions; 2 Core settlement
  tests with 50 assertions; 13 released-v1 navigation runtime tests with 183
  assertions; 7 permission-projection tests with 27 assertions; and 2 focused
  registry tests with 10 assertions. A contained Gate-13-to-14 upgrade probe
  preserved an existing receipt exactly, installed `WITHOUT ROWID` storage,
  left navigation state empty, and returned no foreign-key violation.
- The known unfiltered registry policy mismatch and bounded broad Session-file
  timeout were outside this Gate's causal evidence boundary and were neither
  hidden nor promoted into acceptance blockers.
- The independently accepted snapshot remained at HEAD
  `a4681447f713400b32cf002c6cc52d7de61265df` on branch
  `codex/opencode-v1.17.18-baseline`, with 33 changed paths, zero staged, and
  candidate digest
  `285633465ca59883cc280e5080ad627037b58208f17a2ac3a67cf1378aafdfa1` at
  review start and end. The replacement reviewer made no project-tree, Git,
  branch/ref, publication, or other durable-system mutation.
- The maintainer separately authorized integration after review acceptance.
  Commit `a6b542d59` fixes the accepted implementation provenance;
  `docs/README.md` therefore closes Gate 14 without starting Gate 15.

## 2026-07-20 Gate 15 review acceptance provenance

Current disposition remains owned only by `docs/README.md`. Retained top-level
reviewer task `019f7eb2-d619-7c12-8665-5709efe62594`, run
`gate15-whole-20260720-01`, accepted both contract/theory and
implementation/evidence. It closed `G15-CT-001`–`G15-CT-008` and
`G15-IE-001`–`G15-IE-005`; no maintainer-owned product decision was reopened
and no acceptance-changing finding remains.

- Contract review repaired source-relative temporal authority, settlement
  flooring through the latest cut, predecessor reconciliation order,
  learning-wide qualification, terminal acknowledgement projection, cut
  deletion semantics, prompt-only first consumption, and the exhaustive
  resolved/unavailable source-time union.
- Implementation review repaired the single pre-preparation learner-admission
  carrier; transaction-final effect sealing and sealed, revision-bounded cut
  membership; stale lifecycle fixtures; exact predecessor ordering across
  permission/cancellation/revoke/source-loss/recovery; and rollback injection
  at every retained effect, acknowledgement, frontier, receipt, seal, Part, and
  event boundary.
- Fresh accepted executor evidence passed 28 Core Turn tests with 269
  assertions, 28 database-migration tests with 173 assertions, 18 released-v1
  runtime tests with 240 assertions, and 9 prompt tests with 88 assertions.
  Both affected package typechecks and migration `--check` passed. Focused
  compaction, revert, fork-history, fork-start, deletion, fresh recompilation,
  and restart evidence covered the lifecycle claim.
- The reviewer independently reproduced the final two-window direct-SQL cut
  test at 1 test and 16 assertions and the focused Gate-14-to-Gate-15 migration
  parity case at 1 test and 10 assertions. A cut through an unsealed current
  revision fails snapshot validation; a lower-revision empty cut cannot let a
  later unsealed correction suppress its sealed predecessor.
- Maintainer-authorized real-provider run
  `gate15-openai-oauth-real-model-01` used the inherited OpenAI OAuth path and
  `openai/gpt-5.5` for eleven bounded samples. Its secret-free result and empty
  stderr hashes are
  `81753B3E4597EB5721AB666D23D851C289C0DC1824E22C6D085EFEBB6EB5F897`
  and `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`.
  It predates the implementation-review repairs; deterministic evidence covers
  their admission and atomicity seams, and provider lowering was unchanged.
- Discarded parallel runs sharing one temporary `LearnerHome`, an unrelated
  272 ms versus 250 ms abort-timing assertion, two later five-second database
  ownership timeouts, and one source-lifecycle-lock timeout remain explicit
  non-evidence. Every causally claimed focused or serial suite passed; no Gate
  15 assertion failure is hidden.
- The independently accepted snapshot remained at HEAD
  `18bbc2ef9cfad8c71abde39e5190166f1439e2e5` on branch
  `codex/opencode-v1.17.18-baseline`, with 49 modified/untracked nonignored
  physical files and zero staged. Its sorted changed-content manifest SHA-256
  was `ACEC64527BB8E2DC0C1C77044E7818FA59F971BB87117710596E8971AD13F2F6`;
  the tracked binary diff Git hash was
  `b39e1fd51f3b17853095ff54a4538bf13a32426d`. At review close,
  `docs/README.md` and the Gate record hashed to
  `BF224268E94AA547499BABE664C030F206A4E491A1B0E075EAC71EDF95D60CC2`
  and `9498ECD7AA70624FC073AD71B7C7C4FD3B004C4C73956681E5A39782F58B9F4A`.
  The reviewer made no project-tree, Git, credential, publication, or other
  durable-system mutation.
- The maintainer separately authorized integration after review acceptance.
  Commit `03ea74ec4` fixes the accepted implementation provenance;
  `docs/README.md` therefore closes Gate 15 without starting Gate 16.

## 2026-07-21 Gate 16 acceptance and planning-correction provenance

Current disposition remains owned only by `docs/README.md`. Gate 16 entered
maintainer grill after Gate 15 closed, and that grill is now complete. Its
record preserves the accepted maintainer decisions, accepted engineering
contract, implementation, and closing evidence. Whole-Gate review run
`gate16-whole-20260721-01` returned `Revise`, then closed `G16-CT-001` through
`G16-CT-004` and returned the new `G16-CT-005` Course-withdrawal defect. The
executor repaired that boundary; the same reviewer closed it and returned
`Accept`. The same retained reviewer subsequently closed `G16-IE-001` through
`G16-IE-013`, accepted the deterministic implementation/evidence candidate,
and closed the remaining real-provider qualification `G16-IE-U01`. No
acceptance-changing finding or material unknown remains at the Gate 16
boundary. The contract/theory snapshot accepted before this final status and
evidence append had SHA-256
`F5FEB90F65700CA830CE188628BFA332A08DB49365310B836974040BB5016469`;
the append records closure and does not revise that contract's meaning.
Maintainer-authorized implementation commit
`69433fc78d383bade1d92319eb3153a2cd7c68bd` fixes the accepted implementation
and closes Gate 16.

The maintainer accepted the following correction while pressure-testing Goal
meaning with final-exam preparation:

- Two Goal-only exam demands can require real cross-day allocation even when no
  Assignment exists. In the representative case, a learner starts from zero on
  the 16th, has an operating-systems exam on the 18th and a data-structures exam
  on the 20th; starting ten days earlier must permit a different recomputed
  allocation. A static Goal priority cannot represent both situations.
- The product foundation already assigned deadline, remaining-work, capacity,
  feasibility, allocation, feedback, and recomputation arithmetic for ordinary
  assignments **and other substantial real work** to the program. The later
  Roadmap 09 requirement that Gate 21 first admit an Assignment was therefore a
  derived narrowing, not accepted product meaning.
- Goal and Assignment remain separate authorities. Gate 16 supplies exact Goal
  identity/revision and learner-owned meaning; Assignment supplies obligation
  identity/revision. Gate 21 retains its number and may consume either as a
  typed substantial planning demand while owning accepted planning inputs and
  arithmetic.
- Gate 16 gains no static priority, scheduler, workload, capacity, or allocation
  fields from this correction. Gate 21 gains no authority to merge Goal and
  Assignment or turn every task into an Assignment.
- Gate 21's bounded pre-contract experiment must cover the no-Assignment exam
  case at both start times as well as representative Assignment pressure,
  correction, override, feedback, and recomputation. Gate 23 must qualify
  Goal-driven as well as Assignment-driven cross-day replanning.
- No new numbered Gate is introduced now. If Gate 21's later experiment shows
  that Assignment lifecycle and cross-authority planning need distinct
  acceptance boundaries, that evidence returns to the roadmap owner rather
  than silently splitting the Gate.

The maintainer also rejected a single deterministic rule for interpreting
later pursuit after Goal closure. Real histories may combine abandonment,
substantial forgetting, mistaken achievement, once-true achievement followed by
decay, shallow understanding, a raised standard, renewed pursuit, and changed
purpose. Gate 16 must preserve the learner-accepted interpretation and its
source; time, current ability, evidence, or wording alone cannot decide whether
the next effect corrects, revises, resumes, supersedes, or creates a Goal. Model
clarification is allowed when that difference changes durable history or later
behavior, but it does not authorize an exhaustive learning-history taxonomy or
merge learner state into Goal identity.

The derived review candidate makes those decisions concrete as immutable
linear Goal revisions, optional learner-owned attainment conditions and target
boundaries, explicit lifecycle dispositions, and learner-accepted supersession
relations. One bounded atomic Goal change set may carry several independent
Goal operations from the same learner occurrence, so the OS/data-structures
exam statement can be accepted without partial persistence or a generic
transaction language. A conservative direct learner-request arm preserves
clear learner wording without redundant confirmation; a model-assisted arm
must display and receive once-only acceptance for the exact complete candidate
whenever the model adds or changes consequential meaning. Both reuse the
passed learning-command source, permission, replay, receipt, recovery, and
atomic-settlement invariants. The proposal deliberately stops before automatic
context injection, learner state, planning, terminal composition, or an
integrated product-loop claim.

Fresh top-level reviewer task `019f80b5-58a4-74a1-8530-1405a1e57a25`
returned the first contract/theory `Revise` verdict without disputing the eight
maintainer decisions or planning correction. It found that replacement could
not target an existing Goal, source-head-coupled supersession was silently
cleared by ordinary correction, byte-equal carry could transfer unauthorized
terminal or referent-sensitive meaning, and the replay section contradicted
the passed duplicate/conflict-before-live-state order. The executor repair
replaces source-head coupling with a complete independently preservable
disposition, adds exact existing/new replacement-target arms and current
one-to-one/acyclic validation, records dependency-complete field bases, and
states one total replay order. On the closure pass, the same reviewer retested
and closed all four, then found that requiring every Course membership in every
successor revision to remain active let reversible Course withdrawal block
learner-owned correction, lifecycle change, and
replacement. The executor repair now requires active proof only for initial or
newly added membership; exact predecessor membership remains preservable or
removable while unavailable, including per-member handling in multi-Course
scope. The same reviewer retested and closed `G16-CT-005`, found no new
acceptance-changing contract defect, and returned `Accept`. It reported all
contract passes left the production checkout and Git state unmodified. The
implementation/evidence review exercised the exact working-tree candidate and
repaired canonical command binding, once-only occurrence consumption,
whole-directive authorization, complete confirmation bases and immutable
settlement ownership, temporal and identity integrity, closed JSON shapes,
database frontier protection, provider-shadow rejection, Course-withdrawal
preservation, raw-SQL construction defenses, and Gate 8–15 migration retention.
The retained reviewer ultimately accepted all deterministic repairs. Its final
accepted causal runs included Core learner-Goal `22 pass / 241 expects`, Core
database migration `29 / 192`, Core Course authority `8 / 67`, and released-v1
OpenCode learning-command runtime `33 / 420`, plus both affected package
typechecks, schema/migration parity, and diff checks.

The separately authorized bounded real-provider qualification used
`openai/gpt-5.5` through the production released-v1 Session, Turn, permission,
learning-command, receipt, effect, and terminal acknowledgement carriers. It
proved a direct Goal write, a no-write discussion, four-dimension
clarification, exact once-only acceptance of an atomic two-Goal change set,
causal provider/tool linkage, and later exact-CAS correction. The accepted run
made eight model operations, three applied Goal invocations, three Goals, four
revisions, and three Goal effects/receipts across three Sessions and five
normally completed Turns. Its secret-free evidence JSON was 41,272 bytes with
SHA-256
`46B59E8CA04A8EFD3502743B2DB1B2112E69E2417846CE907CA92960F09F5601`;
stderr was empty with SHA-256
`E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`.
The exact qualification script SHA-256 was
`938654CD3864D0AA67C4F6245F8F4662A49AC9D77E9C3B780993B0C21E509D1B`;
the pinned provider-catalog snapshot SHA-256 was
`F71C7EF836ADE8B32C6F629230B05AB593FF2F39C502F2348964AECD79C3D1BD`.
The isolated raw artifacts were reviewer-inspected and hash-bound, then removed
after acceptance. Their hashes are historical attestations of bytes seen by the
reviewer; because those bytes were not retained, they are not independently
inspectable evidence packages. This captured stochastic qualification proves
model-facing usability and production-path conformance only. Deterministic
suites remain authoritative for state, authorization, dependency, replay,
recovery, and negative behavior.

The correction is propagated through the product foundation, both architecture
documents, Roadmap 09, `AGENTS.md`, this ledger, the live Gate map, and the
[Gate 16 learner Goal authority record](research/opencode-fork-gate-16-learner-goal-authority-2026-07-21.md).
Older dated statements that Gate 16 had not begun or that described the
2026-07-17 Assignment-planning route remain historical evidence of their own
time rather than current disposition.

## 2026-07-27 Gate 16 first-principles reopen

The pre-Gate-17 global hazard audit falsified Gate 16's implementation and
closing evidence against its own accepted natural-language contract. The
contract states that Goal entry is not restricted to `/goal` or any fixed
interaction shape and that a clear learner-authored Goal may commit without
redundant confirmation. In contrast,
`packages/core/src/learner-goal.ts` implements direct admission through a fixed
English/Chinese initiation whitelist and keyword tests,
`packages/opencode/src/tool/learner-goal.ts` requires update wording to include
an internal Goal ID, and
`packages/core/src/learner-goal/constraint-schema.ts` installs a commit-seal
trigger that recognizes direct creation, negation, cadence, scope, target,
condition, disposition, correction, replacement, and no-change intent through
fixed English/Chinese substrings and templates. Direct update/replacement also
requires the learner presentation to contain the internal Goal ID.

The focused test corpus primarily uses machine-shaped expressions such as
`/goal ... active LearnerHome goal with no conditions and no target`; the
accepted deterministic and provider evidence therefore did not test the
claimed open natural-language boundary. A clear expression such as
`请记住我这学期要通过微积分` misses the direct-create whitelist, while a title
containing `Every Day` can be classified as cadence. This is an
acceptance-changing behavior defect, not a documentation-only discrepancy.

Gate 16 is therefore reopened. Commit
`69433fc78d383bade1d92319eb3153a2cd7c68bd` and review run
`gate16-whole-20260721-01` remain immutable historical provenance, but their
close verdict is no longer current. The Goal product boundary remains intended;
at this reopen point the raw-SQL semantic-forensics requirement, affected
physical constraints, natural-language evidence boundary, and primary-TUI
proposal/result presentation required correction and fresh independent
closure. Corrective integration
`9e91d43c629b66d65c8741e342bca7cf05de5667` later closed the
physical/migration and TUI repairs. The natural-language contract,
implementation, and evidence boundary remains open, and Gate 17 remains
blocked on its fresh separate top-level review.

## 2026-07-27 pre-Gate-17 first-principles disposition

The global audit used Repa's intended learning loop and general software-design
constraints as the falsification basis. Maintainer acceptance, an ADR, a Gate
contract, a passing test, or an independent `Accept` verdict retained its
provenance but was not treated as a correctness axiom. The live method and
counterexamples are recorded in the
[pre-Gate-17 global hazard audit](research/pre-gate-17-global-hazard-audit-2026-07-27.md).

The audit changed these historical dispositions:

- **Gate 5:** scoped-reopened at active build, outward-identity, permission,
  and product-surface composition.
  `packages/opencode/script/build.ts` builds and embeds `packages/app` unless
  `--skip-embed-web-ui` is supplied, even though the accepted terminal-only
  boundary excludes Web from automatic build and current release composition.
  The primary TUI also opens upstream OpenCode docs as Repa help, Repa config
  writes upstream schema URLs, and retained provider transports identify Repa
  requests as OpenCode. Runtime Web routes remain disconnected; retained Web
  source and internal namespaces are not ordered deleted. The retained
  custom-Agent creation surface also wildcard-allows capabilities omitted from
  its stale inherited checklist and therefore requires default-deny
  catalog-based repair.
- **Gate 6:** scoped-reopened at trigger-DDL migration lineage and same-version
  schema parity. Database identity, admission refusal, physical ownership, and
  transaction rollback remain accepted.
- **Gate 8:** scoped-reopened at the current physical shared-substrate
  dependency and primary-TUI result-presentation boundaries. Its original
  Course-command settlement remains accepted.
- **Gate 10:** scoped-reopened at primary-TUI permission/result presentation. The
  backend binds exact content-mutation path, operation, rights, lifetime, and
  warning, while the primary TUI presents only the generic permission name.
- **Gate 11:** scoped-reopened at primary-TUI result presentation. Its
  explicitly user-visible typed conversion outcome is hidden by default.
- **Gate 14:** scoped-reopened at primary-TUI confirmation/result presentation.
  The exact default-Course transition snapshot reaches Permission but is not
  shown by the primary TUI, and navigation results are hidden by default.
- **Gate 15:** scoped-reopened at primary-TUI acknowledgement. The direct-run
  carrier formats the exact settlement, while the primary TUI hides generic
  successful tool output by default. Current implementation proves only the
  finite `learning_wide` contribution, not every future steering scope.
- **Gate 16:** reopened as described above; the same TUI proposal/result defect
  also applies.

The audit also established cross-Gate corrective obligations without
invalidating every associated domain authority:

- Later Gate 8 extensions inverted its dependency direction. Generic
  invocation/receipt tables now enumerate domain effects and import their
  tables. The shared substrate must become domain-neutral before another
  command family is added, while atomic effect/receipt/terminal settlement is
  preserved.
- Gate 13–16 arbitrary-SQL closure evidence is reclassified. SQLite remains
  responsible for structural invariants, not hostile arbitrary-SQL security,
  natural-language interpretation, or acknowledgement reconstruction.
- Trigger definitions imported from mutable current helpers are not frozen
  historical migrations. Behavioral trigger changes require versioned DDL,
  same-version parity, and upgrades from real frozen predecessor fixtures.
- Gate 13 current-use resolution may record a Gate 9 observation and therefore
  is not a pure context read. Gate 18 must use a non-mutating resolver or an
  explicitly separate observation stage.
- A restricted custom Agent currently denies only unselected keys from a stale
  inherited checklist while runtime defaults retain `"*": "allow"`. One
  authoritative capability catalog and default-deny restricted profiles are a
  Gate 5 permission-surface correction before Gate 17.
- Gate 5's earlier deferral of OpenCode-branded provider attribution to a later
  identity audit was invalid. Repa-owned config must use a Repa-owned
  version-correct schema or omit `$schema`; active outward network metadata
  identifies Repa or is removed unless an exact provider contract requires a
  recorded and tested compatibility literal.
- Architecture had promoted soft workspace memory into a normal Context
  contribution without a production producer, admission/correction owner, or
  roadmap consumer. It is now an optional consumer-earned future boundary;
  Gate 18 may not invent it to satisfy the superseded wording.

The final independent falsification pass also rejected the audit's first
Gate 17 composition generalization. Separate domain ownership does not imply
separate commits: one bounded explicit local application operation may validate
and atomically commit several named consequences. Gate 17 must compare that
shape with staged settlement and refreshed context for external, long-running,
not-jointly-validatable/authorizable, or result-dependent work. No other Gate
disposition or corrective-barrier scope changed under that review.

The carrier audit found no shadow interactive Tutor runtime: TUI, direct run,
attach, ACP, and server paths converge on the released-v1 Session/Turn/model
spine, while preview-v2 production execution is attached only to a no-op
layer. Dormant release scripts that still name OpenCode identities are not
active workflows, but they remain blockers to any future Repa release-readiness
claim.

Corrective work begun under the 2026-07-27 audit completed on 2026-07-28:
shared-tree corrections for Gate 5, Gate 6/8, and the shared Gate
8/10/11/14/15/16 TUI presentation boundary passed their original or independent
reviewers and final focused verification. Their exact candidate evidence is
recorded in the affected Gate records and the global hazard audit. Corrective
integration commit `9e91d43c629b66d65c8741e342bca7cf05de5667` now fixes
that combined accepted snapshot. `docs/README.md` owns the resulting closed
scoped repairs and Gate 16's narrower remaining reopen. Gate 16's
natural-language corrective amendment has not passed the required fresh
separate top-level review and is not included in that implementation
acceptance.

The same Gate 5 candidate also removes default production registration of the
preview-v2 `customize-opencode` skill while preserving generic v2 configured
skills, the explicitly composable hibernated plugin, and released-v1 skill
discovery/invocation. A separate fresh read-only reviewer accepted this slice
after focused Core and released-v1 tests passed. This is candidate provenance,
with its durable integration owned by
`9e91d43c629b66d65c8741e342bca7cf05de5667`.

## 2026-07-28 bounded pre-Gate-17 audit closure

The maintainer correction after the first falsification pass restored the
parent question that originally triggered this work: repeated discussion had
collapsed new-versus-continuing Course identity, Session continuation, bounded
context reconstruction, a next-Turn draft, and an exact running-Turn steer.
The renewed audit therefore checked whether current authority and the actual
working tree could reconstruct those meanings without inherited OpenCode,
preview-v2, historical review prose, or source proximity taking product
authority.

Two fresh read-only passes accepted the renewed result with no P0-P3 finding.
One followed the authority chain through product, architecture, ADR, roadmap,
Gate, implementation, and retained-carrier behavior; the other independently
checked documentation governance, discovery positions, hibernated executable
support, and physical residue. Together they established the bounded claim
recorded in the
[pre-Gate-17 global hazard audit](research/pre-gate-17-global-hazard-audit-2026-07-27.md):
the previously confusing meanings now have distinct owners; all current
interactive carriers converge on one released-v1 Session/Turn spine; tracked
external `.opencode` control has been removed; retained historical automation
is classified and fail-closed outside standard discovery roots; rendered Web
provenance is visible; and every actual untracked file belongs to a recorded
causal group.

This closes the audit record. The later corrective integration
`9e91d43c629b66d65c8741e342bca7cf05de5667` also closes the accepted
Gate 5/6/8/10/11/14/15 scoped repairs and Gate 16's TUI repair. Gate 16's
natural-language contract amendment still awaits fresh separate top-level
review, and Gate 17 remains unauthorized. Neither the audit verdict nor the
integration claims release readiness, Gate 18 context implementation, Gate 23
product-loop proof, or permanent whole-project health.

## Historical evidence locators

### Pre-fork source audit

`docs/research/opencode-one-time-fork-audit-2026-07-13.md` at the oracle tag.

### Product behavior and dogfood traces

`docs/foundation/03-complete-learning-traces.md` and
`docs/roadmap/05-first-dogfood-tutor-loop.md` at the oracle tag.

### Experiment ledger

`docs/research/experiment-ledger.md` at the oracle tag. This is the locator for
the ALS evidence cited by current architecture and ADRs.

### Superseded decisions

`docs/decisions/0001-opencode-reference-strategy.md` and
`docs/decisions/0011-single-process-tutor-loop-over-mature-mechanics.md` at the
oracle tag.

### Conditional-purpose evidence

ADR-0013's experiment and result packets remain under `docs/research/` at the
oracle tag. They are behavioral evidence, not production modules.

### Identity-isolation evidence

The complete Gate 3 contract and verification record remains
`docs/research/opencode-fork-gate-03-repa-identity-isolation-2026-07-13.md`
at the oracle tag. The active roadmap records its passing commit.
