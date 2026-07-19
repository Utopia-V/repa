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
| 4. Learning-first composition            | Protected released-v1 Repa composition; the hidden-keyed internal-call close claim was later audit-invalidated                                    | `9c7b74f41c6090bc0fa0499c4b1345fa438f0ca6` + `17e25eab2784b8bd71bef7a91effb9ae352bf0ae` | `docs/research/opencode-fork-gate-04-learning-first-composition-2026-07-14.md`        |
| 5. Inherited product-surface disposition | Recorded terminal-only close; later audit preserved valid disconnections but invalidated v2/provider/CORS completion                              | `25e51861effbddbdb04ae8fe88c4107d34ab91b2`                                              | `docs/research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md` |
| 6. Native database admission             | Native Repa database identity and forward lineage; the concrete single-owner implementation claim was later audit-invalidated                     | `6c0b7aa5b`                                                                             | `docs/research/opencode-fork-gate-06-native-database-admission-2026-07-14.md`         |
| 7. Course and Course View authority      | LearnerHome-owned Courses, stable View identities, immutable revisions and mappings, exact working selection, and reversible versioned withdrawal | `3bd6eb9d4`                                                                             | `docs/research/opencode-fork-gate-07-course-view-authority-2026-07-15.md`             |
| 8. Learning-command settlement           | Stable admitted occurrence, physical replay, causal receipt, exact Course acceptance settlement, and Session lifecycle closure                    | `293ff6892`                                                                             | `docs/research/opencode-fork-gate-08-learning-command-settlement-2026-07-16.md`       |
| 9. Source and Artifact authority         | Stable Artifact identity, exact observed revisions, location/availability history, provenance, and correction without retargeting                 | `41db7c292aaeb83abfafea9236480d006ccabe0f`                                              | `docs/research/opencode-fork-gate-09-source-artifact-authority-2026-07-16.md`         |
| 10. Content-root authority               | Approved root identity, bounded observation, separate mutation authority, project-origin quarantine, and exact Gate 9 admission                   | `fb6ed5763ecaa4a95a32ba7f6f352f3dc9794fef`                                              | `docs/research/opencode-fork-gate-10-content-root-authority-2026-07-17.md`            |
| 11. Readable representation lineage      | Immutable readable derivations, exact source proof, truthful conversion/current-use/failure semantics, and bounded managed reads                  | `bdbfa0c05322244d405fa26425c04eb7ceb9c9f0`                                              | `docs/research/opencode-fork-gate-11-readable-representation-lineage-2026-07-17.md`   |
| 12. Durable Turn lifecycle               | Finite learner/delegated Turns with exact model/tool membership, budgets, child lineage, terminal truth, and recovery                             | `80f5fa30a22e3e0628cd4a05e2880063a1f8eb2d`                                              | `docs/research/opencode-fork-gate-12-durable-turn-lifecycle-2026-07-18.md`            |
| 13. Material Map and Course alignment    | Immutable revision-bound material outlines and exact selectors plus optional neutral alignment to exact Course membership                         | `5e762f8336b33d7d8365c9bc9204b52f52eba114`                                              | `docs/research/opencode-fork-gate-13-material-map-alignment-2026-07-19.md`            |

Read a historical record with:

```powershell
git show repa-prefork-oracle:<historical-record-path>
```

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
