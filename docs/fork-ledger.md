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

| Gate                                     | Result                                                                                                                                            | Fork evidence                                                                                                                               | Historical record                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 0. Oracle freeze                         | Pre-fork behavior and assets classified                                                                                                           | pre-fork lineage                                                                                                                            | `docs/roadmap/09-one-time-opencode-fork-baseline.md` at the oracle tag                |
| 1. Lineage                               | Exact full-history `v1.17.18` fork with MIT provenance                                                                                            | `b1fc8113948b518835c2a39ece49553cffe9b30c`                                                                                                  | `docs/research/opencode-fork-gate-01-lineage-2026-07-13.md`                           |
| 2. Windows baseline                      | Preserved inherited invalid PowerShell test failure                                                                                               | exact upstream tree                                                                                                                         | `docs/research/opencode-fork-gate-02-pristine-windows-baseline-2026-07-13.md`         |
| 2A. Test correction                      | Corrected only the invalid shell test contract                                                                                                    | `a72f507de45788f3fb8556d883cdad919f33db43`                                                                                                  | `docs/research/opencode-fork-gate-02a-deterministic-windows-shell-test-2026-07-13.md` |
| 3. Repa identity                         | Independent binary, paths, config, runtime variables, and database filename; no OpenCode-state fallback                                           | `0ffed9f62159b5383b62da73bd270de7f8775e09`                                                                                                  | `docs/research/opencode-fork-gate-03-repa-identity-isolation-2026-07-13.md`           |
| 4. Learning-first composition            | Original three-purpose close plus corrected composition authority and Gate 11 `representation` carrier                                            | original `9c7b74f41` + `17e25eab2`; corrected close `df61b7adb6c6e2c3f5f7fb46bee3109d0e16b05c`                                              | `docs/research/opencode-fork-gate-04-learning-first-composition-2026-07-14.md`        |
| 5. Inherited product-surface disposition | Valid inherited-surface disconnections plus corrected v2/provider/CORS completion                                                                 | original `25e51861effbddbdb04ae8fe88c4107d34ab91b2`; corrected close `86332c24651c1222339624704496fae2dd27be10`                             | `docs/research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md` |
| 6. Native database admission             | Native Repa database identity, forward lineage, hardened admission, and restored single-owner runtime boundary                                    | original `6c0b7aa5b`; corrected implementation `34588b04182761e1afaaa80bd3cab6b48929cd9f`; close `6ad48455ee8dc4695e19ed9e28e88dfe43adade7` | `docs/research/opencode-fork-gate-06-native-database-admission-2026-07-14.md`         |
| 7. Course and Course View authority      | LearnerHome-owned Courses, stable View identities, immutable revisions and mappings, exact working selection, and reversible versioned withdrawal | `3bd6eb9d4`                                                                                                                                 | `docs/research/opencode-fork-gate-07-course-view-authority-2026-07-15.md`             |
| 8. Learning-command settlement           | Stable admitted occurrence, physical replay, causal receipt, exact Course acceptance settlement, and Session lifecycle closure                    | `293ff6892`                                                                                                                                 | `docs/research/opencode-fork-gate-08-learning-command-settlement-2026-07-16.md`       |
| 9. Source and Artifact authority         | Stable Artifact identity, exact observed revisions, location/availability history, provenance, and correction without retargeting                 | `41db7c292aaeb83abfafea9236480d006ccabe0f`                                                                                                  | `docs/research/opencode-fork-gate-09-source-artifact-authority-2026-07-16.md`         |
| 10. Content-root authority               | Approved root identity, bounded observation, separate mutation authority, project-origin quarantine, and exact Gate 9 admission                   | `fb6ed5763ecaa4a95a32ba7f6f352f3dc9794fef`                                                                                                  | `docs/research/opencode-fork-gate-10-content-root-authority-2026-07-17.md`            |
| 11. Readable representation lineage      | Immutable readable derivations, exact source proof, truthful conversion/current-use/failure semantics, and bounded managed reads                  | `bdbfa0c05322244d405fa26425c04eb7ceb9c9f0`                                                                                                  | `docs/research/opencode-fork-gate-11-readable-representation-lineage-2026-07-17.md`   |
| 12. Durable Turn lifecycle               | Finite learner/delegated Turns with exact model/tool membership, budgets, child lineage, terminal truth, and recovery                             | `80f5fa30a22e3e0628cd4a05e2880063a1f8eb2d`                                                                                                  | `docs/research/opencode-fork-gate-12-durable-turn-lifecycle-2026-07-18.md`            |
| 13. Material Map and Course alignment    | Immutable revision-bound material outlines and exact selectors plus optional neutral alignment to exact Course membership                         | `5e762f8336b33d7d8365c9bc9204b52f52eba114`                                                                                                  | `docs/research/opencode-fork-gate-13-material-map-alignment-2026-07-19.md`            |
| 14. Learner navigation continuity        | Learner-controlled default Course preference and independent exact per-Course route anchors with append-only correction and command provenance    | `a6b542d59879f0a4b1111eaef4ad23e446b473d0`                                                                                                  | `docs/research/opencode-fork-gate-14-learner-navigation-continuity-2026-07-19.md`     |
| 15. Retained scoped steering             | Source-linked, scoped, versioned, correctable Tutor-policy state with an exact immutable model-operation cut                                      | `03ea74ec4f760c83060a6da4fa26ecb9519d1468`                                                                                                  | `docs/research/opencode-fork-gate-15-retained-scoped-steering-2026-07-20.md`          |
| 16. Learner Goal authority               | Learner-owned Goal identity, revision, correction, optional target semantics, and explicitly authorized lifecycle meaning                         | `69433fc78d383bade1d92319eb3153a2cd7c68bd`                                                                                                  | `docs/research/opencode-fork-gate-16-learner-goal-authority-2026-07-21.md`            |
| 2026-07-28 cross-Gate correction         | Gate 5/6/8/10/11/14/15 scoped repairs plus Gate 16 TUI repair, authority reconstruction, and inherited-control retirement                         | `9e91d43c629b66d65c8741e342bca7cf05de5667`                                                                                                  | `docs/research/pre-gate-17-global-hazard-audit-2026-07-27.md`                         |

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

## 2026-07-29 Tutor-flow roadmap correction provenance

Current Gate disposition remains owned only by `docs/README.md`. Three fresh
read-only top-level tasks examined the same parent product promise from
different boundaries:

- user and cognitive-flow task
  `019facb1-53a2-7ad1-9dcb-b55c0a496b67`;
- persistence and reliability architecture task
  `019facb1-8d35-7641-8410-8442863974a0`; and
- adversarial roadmap/product-loop task
  `019facb1-d582-7c32-8dd4-b0b8fcd9bc3d`.

Each task received the maintainer correction that LLM-enabled simplification
is a candidate design pressure, not a prohibition on workflows, classifiers,
graphs, or program rules. All three converged on the same missing parent
responsibility: exact stored candidates and a bounded context observer do not
by themselves make the Learning System choose and re-enter a useful current
move. They differed on whether Gate 23 could absorb the repair or a separate
boundary was required.

Producer/consumer ordering resolved that topology question. Gate 18 must remain
an observer; Gate 22 must inspect actual rather than merely possible
consumption; and final Gate 23 integration should not be the first owner of a
substantial control behavior. Roadmap 09 therefore inserts Gate 21A between the
last still-admitted baseline pressure producer and Gate 22. `21A` preserves the
already published Gate 22/23 meanings and historical references; it does not
make Tutor selection a planning subdomain.

The accepted `P17-F16` correction owns only the product responsibility and evidence
boundary. It does not select any mechanism—including an ordinary LLM,
program-policy, separate control sample, mixed implementation, or another
candidate—and it does not require new schema or by itself reopen an earlier Gate. Product
origin, ADR-0013, architecture, Roadmap 09, the status map, Gate 17's downstream
boundary, repository guidance, and the pre-Gate-17 audit carry the resulting
meaning. No production code or Gate-close evidence was changed.

## 2026-07-29 primary-TUI flow correction provenance

Current Gate disposition remains owned only by `docs/README.md`. After the
Tutor-flow roadmap correction, two fresh bounded read-only worker contexts
tested current behavior from the learner's control surface rather than
rechecking the already accepted authority reconstruction:

- `audit_busy_tui_input_semantics` inspected Gate 12, ADR-0005/0007, the
  primary TUI composer/keymap, focused key-routing evidence, and the pinned
  Codex comparison; and
- `audit_gate14_confirmation_friction` inspected Gate 14, ADR-0003/0008,
  navigation command/runtime/permission/database constraints, semantic
  presentation, and existing tests.

Both returned acceptance-changing findings at high confidence.

The Gate 12 finding preserves strict new-Turn admission, exact-target steer,
process-local later drafts, safe promotion, completion-race handling, budgets,
child lineage, terminal truth, and recovery. It rejects only the Repa-owned
primary-TUI mapping that leaves the current-versus-later choice hidden before
first use, describes it in internal vocabulary, hard-codes a `Ctrl+Enter` hint
despite a configurable keymap, and routes a failed current-work attempt into
later delivery without that learner choice. Architecture, Roadmap 09, the Gate
record, the audit, and the status map now carry the correction boundary:
current-work and later delivery are discoverable before first use in learner
language, and every race preserves the learner's selected causal unit.

The Gate 14 finding preserves the separate default-Course and per-Course
route-anchor owners, exact snapshots, CAS/history, correction, replay, stale
failure, and restart truth. It rejects the unconditional two-act authorization
policy for every low-consequence default change. A direct explicit request
already supplies semantic learner authority and must not receive another
Gate-specific prompt under effective `allow`; configured capability `ask`
remains separate. Tutor-supplied meaning must cite the exact accepted proposal,
not only the generated target. The same audit falsified the corrective
presenter's broader same-name claim: the default-Course projection can omit
stable collision-resolving identity, and a name collision created after commit
can make an immutable historical acknowledgement ambiguous. Architecture,
Roadmap 09, the Gate record, the audit, and the status map now carry the
source-bound authorization and stable-replay correction boundary.

Independent collaboration pre-review `review_pre17_flow_corrections` then
tried to falsify the documentation correction. Its first `Revise` rejected a
premature concrete default mapping in upper authority, preserved configured
capability `ask` separately from semantic acceptance, exposed the
post-commit same-name collision against immutable replay, and required the
symmetric independent-next-question oracle before choosing Gate 12's default.
After those repairs, its second `Revise` found the historical Gate 14
two-confirmation row still labelled current `Accepted` authority. The final
repair records that the owning product/architecture correction revoked that
old constraint without promoting the review-pending candidate. The same
reviewer returned final `Accept` with no P0-P3 finding.

Neither audit worker nor that collaboration pre-review was the fresh separate
top-level contract/theory reviewer required for a materially revised Gate. At
that audit point, Gate 12 and Gate 14 were therefore scoped-reopened, their
corrective candidates authorized no implementation, and their current
code/tests/migrations were evidence of defects rather than accepted replacement
behavior. Their later formal reviews, implementations, and integrations are
recorded below. Gate 16's separately reviewed natural-language correction
remains unimplemented, and Gate 17 remains paused behind that boundary.

### Formal contract-review first verdicts

The maintainer then authorized the required fresh separate top-level reviews.
Gate 12 reviewer task `019fad21-8a6a-7450-af90-505c0bce53f8` returned
`Revise` with `G12-RC-001` through `G12-RC-003`: the ordinary-send default had
not become a decision, old queue/fallback clauses still survived as authority,
and explicit later selection was not a legal state distinct from an
undelivered current-work race. The executor has suspended the old clauses and
defined `editing`, `later_selected`, and `undelivered`. On 2026-07-29 the
maintainer compared the two errors and chose ordinary busy Enter for the
reversible, still-unadmitted later draft, with a separately visible configured
action for current-work delivery. The candidate permits edit, removal, or
one-winner reclassification before admission and makes every lost current or
later race truthfully `undelivered` without automatic retarget. All three
findings were addressed in the executor diff, but the first exact-diff closure
pass kept `G12-RC-002` open: one earlier completion-lost-steer clause still
authorized a new queued start identity. The executor has now replaced that
clause with explicit `undelivered`/no automatic start-steer-retry-retarget
semantics, tightened the queue identity text and race table, and fenced the
matching historical `G12-IE-005` fallback. The same reviewer returned
second-pass exact-diff `Accept` with no blocker. Implementation authority is
limited to the primary-TUI busy-input default/discoverability/process-local
delivery-state repair and focused replacement evidence; all strict Turn,
HTTP/SDK, and unaffected lifecycle mechanics remain retained.

The scoped Gate 12 implementation candidate changes only the TUI prompt
composer, stash dialog, keybind description, and focused TUI/keymap tests. Busy
Enter selects an editable process-local later draft without admission; the
configured current-response action targets exact A. Promotion waits for settled
idle plus no active Turn. A transient terminal-before-idle state waits, B
appearing first becomes `undelivered` with zero dispatch, and an already-issued
strict start or steer that loses a server race preserves the full payload
without retry or retarget. Executor integration review found and repaired the
terminal-before-idle counterexample after the first passing candidate.

The original reviewer's first implementation/evidence pass returned `Revise`
with `G12-RC-IE-001` and `G12-RC-IE-002`. The first finding showed that two
IME-flush timers deferred target/intent capture, so B could replace A before the
busy submission acquired meaning. The second showed that asynchronous editor,
paste, and dialog operations begun before the delivery claim could resume after
the claimed snapshot and mutate or lose the draft/stash. The repaired candidate
synchronously captures Session, exact target, delivery intent, and prior
selection; claims the composer before deferring only the IME text flush; uses an
edit revision to reject stale asynchronous continuations; and guards stash
removal at the dialog boundary.

The next exact-diff pass closed `G12-RC-IE-002` but kept
`G12-RC-IE-001` open. Its decisive trace completed terminal A, start B,
terminal B, and idle before `runSubmission`; observing only the final active
Turn then lost the fact that B had competed and incorrectly promoted after it.
The second repair increments a prompt-local same-Session revision on every
`turn.started`, captures it with A, carries it in `later_selected`, and compares
it before materialization and promotion. B's start therefore remains
observable after B terminates. Fresh `packages/tui` evidence reports 19 focused
tests / 58 assertions and package typecheck passing, including the full
B-start/B-terminal/idle-before-both-timers oracle. The exact tracked four-file
implementation diff hashes to
`2e027dc139174ad2ff7530e2d4073814e7fe395e`; the focused untracked test blob
hashes to `0e601d722d68eb254862241b6b3cbf0db65b5886`. The original reviewer returned
second implementation/evidence exact-diff `Accept` with no blocker,
independently reproduced 19 passes / 58 assertions, and closed
`G12-RC-IE-001/002`. The Gate-record binding at review was
`ca857807ae15fbb2c34215ee586c050522cea22e`. Scoped implementation/evidence is
accepted and integrated at
`c5ea10b8ab0f573fef03b5066bbcb117a9e0a502`; the retained strict Turn,
HTTP/SDK, and historical core evidence remain unchanged.

Gate 14 reviewer task `019fad21-ff78-7920-bec4-9d06b2ff7b2c` returned
`Revise` with three P1 blockers and one P3 strengthening. It required a closed
versioned union for legacy confirmation, direct request, and exact source-bound
proposal acceptance; capability settlement separate from semantic authority;
immutable symmetric stable `from`/`to` locators rather than current-state
reconstruction; and a frozen-current-V12-to-V13 migration preserving legacy
replay and pending recovery. The executor's current candidate makes those
choices and fences the executable-looking historical confirmation oracle. It
was reviewed as exact Gate 14 diff
`a54c2d4ec7494fa6ffef3f94405204706ff149a5` within working-tree diff
`12d907c86c8e50771218ba322ccc7201a190058a`; the original reviewer returned
`Accept` with no blocker for the scoped semantic-authorization union, immutable
locator/replay choice, V12 classification/migration, and unchanged route-anchor
boundary.

The subsequent read-only implementation map then falsified the completeness of
that contract's V2 capability recovery. The existing order durably admits a
physical invocation before permission, while permission request/reply is
process-local, leaving three unowned crash windows: before capability
evaluation, after prompt issue but before reply, and after reply but before the
final effect transaction. A narrow corrective amendment now distinguishes
physical admission, durable policy outcome, durable prompt issue, durable
learner reply, and final effect settlement; adds terminal `not_evaluated`;
defines request ID if and only if issue is durable; commits issue before live
publication and reply before waiter release; and recovers without re-prompting
or applying an uncommitted effect. The accepted semantic union, stable
locators, legacy V12 classification, and route-anchor boundary remain retained.
The same reviewer returned `Revise` on the amendment's first closure pass with
`G14-CAP-001`: durable effective-`ask` evaluation could precede issue, while
neither `not_evaluated` nor `prompted_abort` truthfully owned that crash point.
The executor accepted the finding and made effective-`ask` evaluation plus issue
one atomic durable transition before live publication; no durable unissued-ask
state exists. The matching oracle now crashes after in-memory ask selection but
before that atomic commit and requires `not_evaluated` with no request ID. The
same reviewer returned exact-diff `Accept`, closed `G14-CAP-001`, and found no
new blocker. That then-accepted candidate is bound to Gate 14 diff
`b823d8228aff342f697baff92a59ec8ca4bfaa5d`; related Gate 14 clauses were
reviewed within seven-document diff
`242598c71180fb72adf4828f1f954f8a1d4e6b3f`, excluding concurrent unrelated
Gate 12 status bookkeeping.

A deeper implementation map then falsified five narrower assumptions while
retaining the direct/source-bound semantic split, capability lifecycle,
current-state-free replay, and route-anchor behavior:

- V12 `applied`, `already_applied`, `no_change`, `error`, and `admitted` rows do
  not uniformly contain confirmation/effect evidence or a truthfully issued
  permission request. Their command reservation identity must remain distinct
  from any referenced effect-confirmation identity.
- V12 change/clear did not record authorization-time `from` Course version or
  working selection; predecessor or current state cannot fill the gap.
- `accepted_proposal_v2` needs one real host-bound producer. The revised
  contract uses a reserved non-mutating, host-prepared completed Tool Part and
  rejects plain text, unsealed/copied-without-lineage, and provider-executed
  proposal calls.
- Genuinely new V2 candidate authorization is reserved atomically with physical
  admission; final settlement revalidates and seals an effect link rather than
  creating the authorization for the first time.
- The V12 no-effect validator is physically shared with route anchors. V13 may
  replace that wrapper for default V2 only while preserving the route branch,
  route-owned DDL, rows, and behavior.

The Gate 14 record now contains that exact amendment. Original reviewer task
`019fad21-ff78-7920-bec4-9d06b2ff7b2c` returned second narrow exact-diff
`Accept` with no blocker. The accepted bindings are Gate 14 diff
`47679d327716ccc7394b2e77393faee76ad20576` and related seven-document diff
`ebf8daa9047595ce5c2eac5eca77580caef0aa88`, excluding Gate-12-only
bookkeeping. Scoped implementation authority became available for this contract
at that review point; no replacement implementation or evidence was accepted.

The subsequently dispatched single top-level Gate 14 recovery executor found a
sixth, narrower contract/implementation collision before changing code. Accepted
replay clauses require a committed same-address duplicate/conflict to settle
before current-owner and capability checks, but the five-seam amendment also
required every new V2 physical invocation to reserve a complete exact
current-owner authorization snapshot and later capability outcome. If target B
has been withdrawn after occurrence O already committed target A, a new O→B
invocation must return `semantic_conflict` without validating B, yet no truthful
exact B locator exists for the mandatory authorization row. This is tracked as
`G14-RC-IE-SEM-001`.

The owning contract candidate preserves Gate 8 universal physical admission and
splits the later domain disposition: a pre-existing semantic duplicate/conflict
atomically settles the new physical invocation as `semantic_terminal_v2`
without candidate authorization, capability policy, request ID, or
`not_evaluated`; only a genuinely new `candidate_v2` atomically reserves one
direct/source-bound authorization arm and enters the accepted capability
lifecycle. A candidate that becomes duplicate/conflict only during the final
recheck retains its truthful earlier authorization/capability history. The
original five seams, route behavior, immutable locator/replay, and atomic
ask-plus-issue repair remain retained. The executor made no new edits, staging,
or commit. The pre-existing large Gate 14 working-tree diff remains an orphaned,
unaccepted candidate mixed with accepted Gate 12 changes; it must be classified
and recovered rather than bulk-discarded. Implementation authority was
suspended pending original reviewer task
`019fad21-ff78-7920-bec4-9d06b2ff7b2c`.

That original reviewer returned third narrow exact-diff `Accept` with no
blocker and closed `G14-RC-IE-SEM-001`. It accepted the closed disposition
union described above while retaining the prior five seams, direct versus exact
source-bound candidate authorization, semantic/capability separation, atomic
ask-plus-issue recovery, immutable current-state-free locator/replay, unchanged
route admission/meaning/CAS/history/correction, and Gate 8 order. The accepted
candidate is bound to HEAD `1f4889edced96e9df3dff6aec279db57b3059586`,
Gate 14 document diff `5ae66e8aa5d8bd8783b4be05e64f4c65db915b2e`,
and related seven-document diff
`852a1a5034f838715ac0f46b0b2b52f810f095d8`, excluding unrelated Gate 12
bookkeeping. Scoped Gate 14 implementation authority is restored for this
amended contract only. The orphaned/partial implementation and its evidence
remain unreviewed and unaccepted.

The single top-level recovery executor then classified and reconciled the
orphaned package diff under that accepted amendment without staging or
committing. Its first 2026-07-30 implementation/evidence candidate contained 49
tracked and eight untracked Gate 14 package paths, with tracked-diff SHA-256
`56ea1c0d16f1c43deddb6e4bc56323bbf9344bc9efff75a8236c4c731298708c`
and 57-path manifest SHA-256
`6c94c5d5e22ad1ab8fe473faee247ef54e7e8728bb081ea0e8feeeb5a3d1ca23`.
Those bindings are rejected provenance, not the current candidate.

The original reviewer returned `Revise` with `G14-IE-STO-001`: final
semantic-first candidate race settlement was illegal after non-allow
capability history; `G14-IE-STO-002`/`G14-IE-RT-001`: a migrated
`legacy_v1` admitted row with durable Turn/Input identity could not reach
truthful interrupted recovery; and `G14-CAR-001`: public wire, presenter, and
database shapes still admitted V1-partial endpoints for V2 authorization or
acknowledgement. It also reported nonblocking `G14-IE-RT-002`: proposal Part
publication could commit before notification interruption while generic Turn
audit recorded failure.

The same top-level executor repaired those findings without changing the
accepted contract, Gate 12, or route-owned behavior. V13 now admits both final
race outcomes after every truthful capability terminal state while preserving
candidate history; production startup recovers exactly the migrated V1
admitted shape; V1/V2 endpoints are closed and discriminated across types,
wire, presenter, table checks, insert triggers, and the versioned migration;
and exact durable proposal/Part reconciliation prevents a false generic Turn
failure after post-commit notification interruption. Frozen-V12 and fresh V13
definitions are identical, raw V12 bytes remain unchanged, partial V1 history
remains readable, exact set/change/clear and later same-name replay pass, and
the shared route seam remains equivalent.

The original reviewer's second implementation/evidence exact-diff pass closed
`G14-IE-STO-001`, `G14-IE-STO-002`/`G14-IE-RT-001`, `G14-CAR-001`, and
nonblocking `G14-IE-RT-002`, then returned `Revise` solely for
`G14-IE-RT-003`. Live permission abort and startup recovery derived or replayed
truthful capability history but settled interrupted/permission error without
normal settlement's semantic duplicate/conflict recheck.

The same top-level executor repaired that production divergence without
changing the contract, storage schema, migration, normal settlement semantics,
Gate 12, or route ownership. Recovery now derives or replays capability truth
first and then calls the same semantic-race settlement helper as the normal
candidate path. Production-entrypoint matrices cover live `not_evaluated` and
issued/no-reply `prompted_abort`, plus every startup policy/reply outcome,
against both duplicate and conflict; no-winner durable allow remains
interrupted and effect-free.

The final repaired candidate contains 50 tracked and ten untracked Gate 14
package paths. Its raw tracked binary diff from accepted base HEAD
`1f4889edced96e9df3dff6aec279db57b3059586` has SHA-256
`85fef1a28edfaf7fc4aef490a3d6de6d97639d4edefd117cfa4e7fbc71f57106`;
its ordinal complete 60-path Git-blob content manifest has SHA-256
`7d0b43bf7aeb69b29b3bdf75db67592aeffbc9efd9f043c880875768676d946f`.
Core, Schema, SDK, and TUI package typechecks pass. OpenCode typecheck reaches
only unchanged TUI-plugin fixture errors. The Gate record owns the exact
commands, results, exclusions, sorting convention, and classification.

Original reviewer task `019fad21-ff78-7920-bec4-9d06b2ff7b2c` returned final
exact-diff `Accept`, closed `G14-IE-RT-003`, retained every previously closed
finding and boundary, and granted scoped integration authority. It reproduced
live-abort 1/50, startup recovery 1/192, full runtime 43/763, Core typecheck,
and diff check. The exact implementation/evidence was integrated at
`80fde20121c4b98ef9c7514ad7e33cae71c7e6b0`. This closure grants no Gate 16 or
Gate 17 authority.

Both producer tasks explicitly returned completion callbacks to this source
task. Gate 14's first callback closed the then-current contract; its later
implementation mapping caused the narrow recovery reopen above, and its
amendment callback first returned `Revise` for `G14-CAP-001`, then returned
`Accept` after the atomic ask-plus-issue repair. Gate 12's first callback
identified the single residual above and its second callback closed the
repaired contract; its implementation/evidence callback then identified
`G12-RC-IE-001/002`. The next callback closed `IE-002` but retained `IE-001`
for the complete intervening-B cycle; the final callback closed that residual
and accepted the scoped implementation/evidence. Gate 14's deeper mapping then
caused the five-seam amendment above; its original reviewer callback accepted
that amendment with no blocker. The later top-level recovery callback exposed
`G14-RC-IE-SEM-001`; the third narrow original-reviewer callback accepted its
repair and restored scoped implementation authority. Two implementation/evidence
`Revise` callbacks then exposed and closed the storage, recovery, carrier,
proposal-audit, and final `G14-IE-RT-003` production-entrypoint gaps; the last
callback returned `Accept` with no blocker and authorized the integration
recorded above. None of these verdicts changes the unaffected accepted
boundaries recorded above.

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
physical/migration and TUI repairs. Fresh separate top-level review task
`019fa8a5-eea1-79f0-abd8-50df4f3cdaa0` later accepted the repaired
natural-language contract as implementation authority. Corrective
implementation and evidence remain open, and Gate 17 remains paused behind
that boundary.

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
natural-language corrective amendment later passed fresh separate top-level
review in task `019fa8a5-eea1-79f0-abd8-50df4f3cdaa0`; that contract
acceptance is separate from the still-unstarted corrective implementation and
evidence.

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
`9e91d43c629b66d65c8741e342bca7cf05de5667` also closes the then-accepted
Gate 5/6/8/10/11/14/15 scoped repairs and Gate 16's TUI repair. The Gate 5
closure is later scoped-reopened only for the retained OAuth regression
recorded below; its unaffected repairs remain closed. Gate 16's
natural-language contract amendment later passed fresh separate top-level
review, while its implementation/evidence and Gate 17 authorization remain
open. Neither the audit verdict, integration, nor contract acceptance claims
release readiness, Gate 18 context implementation, Gate 23 product-loop proof,
or permanent whole-project health.

## 2026-07-28 Gate 16 corrective contract review

Fresh separate top-level reviewer task
`019fa8a5-eea1-79f0-abd8-50df4f3cdaa0` reviewed only the reopened Gate 16
natural-language contract. Its first pass returned `Revise` with
`G16-RC-001`: a cursor- or budget-cropped Goal/Course candidate view could hide
another reasonable referent while the selected head/version still passed the
proposed direct-write checks. The executor independently verified the
counterexample against cursor-bounded Goal discovery and the architecture's
explicit omission/truncation contract.

The revised amendment binds natural references to immutable, runtime/owner
produced command-specific resolution provenance: exact source/context cut,
declared structural query scope, all candidates in that scope, explicit
completeness/truncation, the selected head, and relevant owner-cut
revalidation. Only a complete, untruncated operation-relevant view may support
direct `learner_request`; incomplete or model-cropped views must widen,
clarify, or use the complete `learner_acceptance` surface. The first effect
atomically retains that basis as provenance rather than effect identity, and
replay cannot replace it.

The same reviewer retested the revision and returned `Accept` with no remaining
acceptance-changing finding. Acceptance is limited to the corrective amendment
in the Gate 16 record as implementation authority. It does not close
implementation or evidence, authorize Gate 17 or Gate 18 context injection,
create a general semantic resolver/command bus, or establish permanent project
health. No code, provider run, or Gate 17 work occurred during either review
pass.

## 2026-07-30 Agent-native semantic ownership correction

The maintainer identified a product-level contradiction before Gate 16
implementation began: the ordinary Agent already owns natural-language
understanding, yet Gate 14 and Gate 16 attempted to make program machinery
prove the Agent's interpretation. Repository inspection confirmed one shared
cause:

- Gate 16 application/Core code parses fixed English/Chinese Goal phrases and
  requires internal Goal IDs for direct contextual updates;
- the released Agent has no model-visible Goal owner query;
- the reviewed Gate 16 amendment replaces phrase parsing with a complete,
  untruncated, persisted candidate universe as direct-write authority;
- Gate 14's accepted default-Course V2 surface uses the same exhaustive
  resolution-scope proof while exposing no ordinary Course discovery tool; and
- Gate 21A required an up-front mechanism comparison before trying the ordinary
  Agent with trustworthy context and tools.

Product origin and ADR-0008 already supplied the correct ownership split. The
2026-07-30 correction now makes it explicit and propagates it through
ADR-0012/0013, architecture, Roadmap 09, repository guidance, the Gate
14/16/17 records, the pre-Gate-17 audit, and the current status map:

- the ordinary interactive Agent is the default for open-language
  interpretation, contextual reference, semantic comparison, and local Tutor
  choice;
- model-visible owner queries provide exact IDs, versions, snapshots, cursors,
  and explicit truncation, while the Agent decides whether to read more or
  clarify;
- typed commands and program code retain identity/version, capability,
  permission, legal transition, atomicity, replay/recovery, visible result, and
  correction without claiming to prove linguistic entailment;
- Gate 14 is contract-reopened only for default-Course Agent query/admission;
  its default identity/history, route anchors, CAS, migration, locators,
  capability lifecycle, replay/recovery, and TUI result remain retained;
- Gate 16 is contract-reopened for the Goal Agent query/write surface; its
  structural Goal decisions and accepted TUI repair remain retained inputs;
- Gate 17 owns durable bootstrap command composition through the ordinary
  Agent, with `/learn` optional rather than required; and
- Gate 21A retains product-flow evidence but first tests the ordinary Agent.

The prior Gate 14 and Gate 16 reviewer verdicts remain exact provenance for the
candidates they reviewed. Their candidate-proof clauses are no longer current
implementation authority. No production file, migration, test, or staging area
was changed by this documentation correction. Fresh separate contract/theory
review is required after the simplified Gate 14 and Gate 16 contracts are
derived; Gate 17 implementation remains unauthorized.

### Agent-native Gate 14/16 contract derivation

The follow-on derivation completed the documentation boundary without changing
production code:

- Gate 14 now exposes thin default-Tutor Course/navigation reads and one
  model-visible `{set courseID}|{clear}` command. Runtime atomically binds the
  current default head and exact Course/working-selection/View/Revision locator.
  New writes use honest `agent_action_v3` and `semantic_terminal_v3` shapes;
  historical V1/V2 resolution/proposal/confirmation records remain exact
  read/replay-only state. The forward boundary is V13→V14.
- Gate 16 now exposes thin Goal reads plus the Gate 14 Course reads and accepts
  one bounded `create/update/replace` semantic-intent change set. The model
  supplies an exact existing head Revision and only the fields to change; the
  Goal owner captures current versions, materializes exact before/after
  snapshots, and owns CAS, permission, recovery, and complete revision
  persistence. Current writes contain no phrase proof, internal-ID-in-source
  rule, exhaustive candidate set, source excerpt, model-selected field basis,
  or Gate-specific confirmation. The forward boundary is V14→V15.
- The system architecture's former current V2 direct/source-bound proposal
  protocol and the native data model's Goal acceptance wording were corrected
  at their owning layers. Historical Gate prose remains explicitly labelled as
  provenance rather than current authority.

Two bounded read-only contract audits independently challenged the drafts. They
caused the model-visible payloads to lose echoed owner versions, source
excerpts, complete revision copies, and per-field proof labels; they also
identified the need for V3 semantic terminals, reserved historical tool IDs,
honest cursor semantics, frozen legacy recovery, and ordered Gate 14→Gate 16
migrations. No maintainer-owned product choice remained unresolved.

This is a derived contract candidate, not implementation authority. Gate 14
must first receive fresh separate top-level contract/theory review. Gate 16
depends on the accepted Gate 14 `agent_action`/V14 boundary and then receives a
different fresh top-level review. No code, migration, product test, staging, or
commit was performed by this derivation, and Gate 17 remains unauthorized.

Against base HEAD `0d7ca3987ea69445d23f30ee8386706c0bbc86c9`, the raw
binary Git diff for the Gate 14 authority bundle
(`architecture/00` + Gate 14 record) is 41,824 bytes with SHA-256
`c31971b9511f5963c89ca3723c41309890afd520fefb2abcdd13ca1ed3a31f2a`.
The Gate 16 authority bundle (`architecture/01` + Roadmap 09 + Gate 16
record) is 77,664 bytes with SHA-256
`f36b9ee2e3487f148193b1813a6ca7d65b42fc872a2c966569d95e3ef936e6cb`.
Status-map, audit-disposition, and this provenance bookkeeping are excluded from
those contract hashes.

Fresh Gate 14 reviewer task `019fb27f-4416-7c42-bcad-97d473803750`
independently reproduced the original 41,824-byte
`c31971b9511f5963c89ca3723c41309890afd520fefb2abcdd13ca1ed3a31f2a`
candidate and returned `Revise` with `G14-AN-001..003`. It found one live
historical expected-version/proposal contradiction, an ambiguous use of
`agent_action_v3` as “authorization” rather than Agent issuance/admission
provenance, and evidence too broad to disprove retained proposal registration
or the new V3 crash windows. The reviewer retained the thin owner reads, exact
set/clear model input, runtime-bound state, semantic-first ordering, capability
lifecycle, V1/V2 replay, V13→V14 migration, stable locators, and every
route-anchor boundary. It made no repository mutation.

The top-level executor repaired only those seams. The historical command clause
now leaves caller-supplied versions current only for route anchors, the audit's
accepted-proposal rule is explicitly V2 provenance, and the non-goal excludes a
host parser rather than ordinary Agent interpretation. `agent_action_v3` and
the shared `agent_action` basis now name the exact root-or-child Agent
issuance/admission lineage and are separate from capability authorization,
learner assent, and semantic proof. Closing evidence now requires read
visibility/intersection and collision tests, built-in proposal-producer
retirement with permanent ID reservation, and fault-injected V3 recovery at
every admission/ask/issue/reply/final-settlement boundary.

Against the same base HEAD, the superseding Gate 14 authority bundle is 47,228
bytes with SHA-256
`5b94956c19724d43a908733c1e364e708502328b48ddcc6d85afd6bcb04be92a`.
The dependent Gate 16 bundle is now 77,888 bytes with SHA-256
`ea36c00cb5eca5cc87d8541cfe3a187f96bcbebe354b151dbb06b71a07de9cd6`
because its shared `agent_action` wording now carries the same root/delegated
issuance semantics. Exact-diff closure by the Gate 14 reviewer remains pending;
there is still no Gate 14/16 implementation authority.

The same reviewer's first closure pass independently reproduced that binding,
closed `G14-AN-001` and `G14-AN-003`, and returned `Revise` only for
`G14-AN-002-R1`: two unqualified current Gate clauses and one architecture
sentence still named a versioned/pre-commit/candidate “authorization” surface.
The top-level executor replaced those residual names with a closed
current-V3-Agent-issuance versus historical-V1/V2-authorization union, the
configured capability-`ask` plus typed Tool/final-result surfaces, and an
Agent-issuance/capability split in architecture. The second superseding Gate 14
authority bundle is 48,920 bytes with SHA-256
`52909e932fa7602d1c29f30886ddd644592c5220711146cd1a641fb237614a67`.
Second exact-diff closure remains pending; implementation authority is still
unavailable.

The same reviewer then returned second exact-diff `Accept`, closed
`G14-AN-002-R1`, and confirmed that no acceptance-changing finding remained.
Scoped implementation authority is available only for the accepted Agent-native
Gate 14 default-Course seam and its focused evidence contract; no implementation
or implementation evidence was accepted, and Gate 16/17 remain unauthorized.
The accepted semantic candidate is exactly the 48,920-byte `52909e932...`
binding above. The subsequent mechanical Gate-status promotion changes the
current two-file aggregate to 48,900 bytes with SHA-256
`425df25f18880cb3ac89da8062c35c83b6eb2940c419c3e8e9250e0f39c77b62`
without changing a contract clause. Gate 16's now-reviewable candidate bundle
is 77,857 bytes with SHA-256
`e185493de374748252dd160627135b4d34ed194ca3665798c6bc13e336f27cd2`.

The top-level executor then assembled the scoped Agent-native Gate 14
implementation/evidence candidate in the unstaged working tree. Fresh focused
checks pass across V13→V14 migration and generated schema (38 tests / 333
assertions), default-Course runtime (44 / 781), registry (28 / 97), processor
(30 / 158), presentation (6 / 55), permission, schema, SDK, and TUI. The
historical proposal producer is unreachable while its identifier remains
reserved, and provider execution of that retired identifier fails closed.
The remaining bounded released-Agent qualification is implemented as
`packages/opencode/script/gate14-real-model.ts`. Corrective integration
`9e91d43c6` had disconnected Repa's inherited ChatGPT Plus/Pro OAuth
registrations and exposed only an API-key path; the working tree restores login
into Repa's own credential store without borrowing Codex Desktop's local
credential. The later 2026-07-31 qualification and the composition corrections
it forced are recorded below. No current Gate 14 implementation/evidence
acceptance is claimed.

Fresh Gate 16 reviewer task
`019fb2a3-c902-7882-8134-1bf33f1eb04d` independently reproduced the exact
77,857-byte
`e185493de374748252dd160627135b4d34ed194ca3665798c6bc13e336f27cd2`
three-file authority bundle and returned `Revise`. `G16-AN-001` requires a
closed historical-V1/current-semantic-terminal/current-candidate Goal
projection whose semantic identity excludes Agent issuance and whose
pre-admission lineage failures cannot fabricate candidate provenance.
`G16-AN-002` requires the exact V2 target intent, normalized stored/read shape,
runtime temporal facts, and truthful V1→V2 omitted-target carry.
`G16-AN-003` requires deterministic read-discovery/collision, provenance,
semantic-race/crash, and legacy-producer-retirement evidence. The reviewer
retained the ordinary-Agent query/write boundary and every unaffected Goal
identity, revision, lifecycle, transaction, migration, TUI, and provider-
qualification decision. No Gate 16 implementation authority is available
until the repaired exact diff is accepted by that same reviewer.

The top-level executor repaired only those three findings. The current Goal
projection is now the closed
`legacy_v1 | semantic_terminal_v2 | candidate_v2` union: semantic terminals
carry no Agent/capability/live-target facts, genuine candidates carry exact
root/delegated issuance separately from capability, and final race losers keep
truthful admitted history without an effect. V2 semantic equality uses only the
canonical typed Goal intent. The exact V2 target input is absent, civil instant,
or local date plus a source/IANA/fixed-offset zone selector; the runtime binds
tzdb/epoch/offset facts, V2 revisions store normalized values, and V1→V2 carry
projects only immutable value while preserving V1 proof bytes on the
predecessor. Closing evidence now explicitly covers read policy/collisions,
root/delegated/missing-capability provenance, semantic-terminal/final-race
distinctions, every capability crash window, the target/carry matrix, and
retirement of V1 proof/confirmation producers and controls.

Against base HEAD `0d7ca3987ea69445d23f30ee8386706c0bbc86c9`, the repaired
three-file Gate 16 authority bundle (`architecture/01` + Roadmap 09 + Gate 16
record) is 98,955 raw binary Git-diff bytes with SHA-256
`614569047251989fc7eb6ee90b53fd8991f704370517a8e311f2f28a2e3bede4`.
`git diff --check` passes with only checkout line-ending warnings. This is an
exact-diff closure candidate for the same reviewer, not implementation
authority.

The same reviewer independently reproduced that exact 98,955-byte binding and
returned `Accept`. `G16-AN-001..003` are closed with no new blocker or
maintainer-owned choice. Accepted scope is the ordinary-Agent Goal/Course read
and typed create/update/replace path, closed V1/semantic-terminal/candidate
projection, canonical-intent semantic identity, exact V2 target/carry
projection, runtime-bound owners and temporal facts, V14→V15 migration, and
the strengthened deterministic/provider evidence split. Historical V1 truth,
Goal identity/revision/lifecycle/supersession, atomic multi-Goal settlement,
replay/recovery/correction, and durable TUI results remain retained.

Scoped Gate 16 implementation authority is therefore available at the
contract/theory layer. The reviewer explicitly requires implementation to
consume an accepted Gate 14 V14 implementation/evidence predecessor, not the
still-unaccepted Gate 14 candidate currently present in the shared tree. No
Gate 16 implementation or Gate 17 authority follows until that ordering
condition is met. Later Gate 14 closure and integration at `ff0ef1fd7`
satisfies that predecessor condition; Gate 16 implementation still has not
begun. The mechanical Gate 16 status promotion changes the
three-file aggregate, without changing an accepted contract clause, to 98,839
bytes with SHA-256
`c2204a546e6fe7e4e414c2c0a92cfe2fa31c54b4c7468d26622e180b0e3de7fd`.

## 2026-07-30 Gate 5 inherited OAuth regression correction

Maintainer correction reopened only the retained OpenAI provider-authentication
slice of Gate 5. Commit
`9e91d43c629b66d65c8741e342bca7cf05de5667` had removed the released-v1
`CodexAuthPlugin` registration and Core browser/headless methods even though
Gate 5 explicitly retained ordinary OAuth and Gate 11, Gate 15, and Gate 16 had
already used that path for bounded real-model evidence.

The top-level executor owns the unstaged correction. Its precise package scope
restores the two registrations and CLI/TUI discovery, and updates the concurrent
token-refresh test to the current `{ providerID, auth }` SDK request shape.
Red-first focused tests reproduced the missing Core methods, absent released-v1
OpenAI auth methods, and API-key-only CLI/TUI presentation before the
production restoration. Fresh exact-source evidence then passed 44 tests / 68
assertions across Core registration, released-v1 auth projection, CLI/TUI
discovery, and concurrent token refresh. Core and TUI typechecks pass.
OpenCode's package typecheck reports only the pre-existing TUI fixture
diagnostics and the separate unaccepted Gate 14 candidate, with no OAuth-path
diagnostic. No migration, schema, SDK generation, credential copy, or new
authentication abstraction is part of the repair.

Read-only audits found no second same-level mature runtime deletion in the
responsible commit. Terminal-only composition, `.opencode` control-plane
cleanup, dangerous release/install isolation, preview-v2
`customize-opencode` default retirement, and restricted-Agent default-deny
remain retained. Provider-specific header/referrer edits were then checked
against current official service documentation. GitHub/Cloudflare User-Agent
changes truthfully identify the caller; OpenRouter, Vercel, ZenMux, and Kilo do
not require the removed OpenCode referer for inference; and
LLMGateway/Cerebras/NVIDIA use the remaining values as attribution rather than
authentication. xAI's browser-OAuth `referrer=repa` remains unverified because
xAI publishes no compatibility contract for that inherited client; no xAI
browser-login support claim is made from construction tests alone.

The first real headless attempt reached OpenAI's device flow and emitted a user
code, then expired without authorization and wrote no credential. A later
maintainer-completed attempt wrote exactly one `openai:oauth` credential into
Repa's own credential store. No API-key credential was introduced and no Codex
Desktop credential was copied.

Against base/HEAD `0d7ca3987ea69445d23f30ee8386706c0bbc86c9`,
the exact ten-path OAuth package diff is 11,834 raw binary Git-diff bytes with
SHA-256
`456ddd6f9b31e092823b9e8142148198584ead1169ae2a0697aff6d201b5fe34`.
The ordinal ten-path content manifest has SHA-256
`02d2b37d5036ee866e5df671d776d29294edfcd5ebce1d30bd650dcd81a96dab`;
each line is the 40-hex output of `git hash-object --no-filters`, two spaces,
the path, and one LF. The five authority files are already a mixed Gate 14/16
working bundle, so their aggregate diff is not mislabeled as an OAuth-only
binding. Staged path count remains zero.

The real login and Gate 14 qualification described below close the runtime
unknown. Independent implementation/evidence closure remains outstanding, so
the OAuth correction is still unstaged, unintegrated, and not reclosed.

## 2026-07-31 Gate 14 real-provider qualification and lifecycle corrections

The top-level executor ran
`packages/opencode/script/gate14-real-model.ts` only after the maintainer
completed Repa's restored ChatGPT Plus/Pro login. The qualification used an
isolated configuration, credential projection, database, data directory, and
cache; it did not print or persist the credential as evidence. The released
model was `openai/gpt-5.5`.

Run `gate14-openai-oauth-real-model-01` completed three Sessions and four Turns:

- unique `Distributed Systems` selection used `course_query` followed by one
  V3 default-Course write;
- two same-title `Algorithms` Courses produced one clarification and no write;
- a `Linear Algebra` suggestion read owner state and did not write; and
- the learner's later acceptance in the same Session issued one V3 write.

All four durable Turns are `completed/normal`. Both physical writes are
`command_version=3`, `authorization_basis=agent_action`, and `applied`; both
retain root Agent-issuance provenance. No permission request was emitted under
effective `allow`, and the V14 database contains zero historical proposal rows.
The script SHA-256 is
`ae2f771494f5e8a5d3c91cff7e9997158499ae02b6bd9a66899c139e89699e74`.
The 17,098-byte zero-warning/error log hashes to
`f2ad6640477dab3ad1c107ca8e3e558ab1d95bd05c49fff9359369742e590569`;
the 2,785,280-byte isolated database hashes to
`74b5de865f228b67e970cfb287a2219549a3e2ab2d0eff96abb69bc56e48389a`.

The real path first failed at three cross-boundary seams that local
default-Course mocks had not exercised:

1. `ToolRegistry.tools()` published `prepareToolCall`, while the adapter read
   only its internal `prepareLearningCommand` field; real learning Tool calls
   were aborted before their host preparation.
2. A terminal Turn row could become visible before its exact owner handoff
   finished. `awaitTurn` returned the row, then the learner's same-Session
   follow-up encountered `Busy`.
3. Inherited detached title, summary, prune, and per-step summary tasks could
   retain Repa's durable Session lock after the Turn. Summary additionally
   tried to write derived diffs into an occurrence-linked User Message whose
   exact presentation Gate 8 had already frozen.

The working tree now preserves host preparation across registry publication,
keeps the exact Turn owner until handoff finalization, joins that owner from
terminal `awaitTurn`, and contains title/summary/prune work inside the causing
Turn. The first Gate 12 review returned `Revise` because promotion-ready idle
was still published before the lifecycle admission released the exact terminal
owner, and because awaited prune failure was silently ignored. The repaired
candidate makes that exact terminal owner replaceable only at its post-lifecycle
idle publication, proves a listener can directly admit distinct Turn B without
queue/retry/retarget, and logs the non-fatal prune cause. Derived diffs live on
the Session summary or are computed for a historical Message on demand;
admitted User Message bytes remain immutable.

The same reviewer returned a first closure `Revise`: `G12-OH-002` closed, but
residual `G12-OH-001-R1` showed that A entered `releasing` before its idle
publication. B could therefore replace A and publish busy before A's
unconditional idle write, leaving the owner map correct but the observable
Session status stale. The superseding repair gives status writes a per-Session
revision, makes A's idle publication conditional at every yielding boundary on
A still being the exact owner, and allows only distinct `startTurn(B)` to
replace A during release. `assertNotBusy` and shell admission stay closed until
the owner is removed or replaced. A deterministic oracle pauses A before idle,
admits and runs B through busy, resumes A, and proves that A emits no later idle
or deletion and that neither Turn is retried. Fresh causal results are:

- Session 33 pass / 234 assertions;
- Prompt 14 / 111;
- Processor 30 / 158;
- snapshot/tool-diff race 1 / 6;
- learning-command runtime 44 / 781;
- registry 28 / 97; and
- semantic presentation 6 / 55.

OpenCode typechecking now reports only the unchanged
`specs/fixtures/tui-plugins/tui-smoke.tsx` diagnostics; no current candidate
path error remains. These repairs preserve the accepted Gate 8 immutable
source and Gate 12 finite-owner meanings; they do not introduce new product
semantics. Gate 12's original reviewer has now accepted the owner-handoff
correction; Gate 5 OAuth, Gate 8 presentation, and the whole Agent-native Gate
14 implementation/evidence candidate retained separate independent review
obligations at this checkpoint and remained unstaged. Later sections record
Gate 12 and Gate 14 acceptance/integration; OAuth and Gate 8 remain pending,
and Gate 17 remains unauthorized.

Against base/HEAD `0d7ca3987ea69445d23f30ee8386706c0bbc86c9`, all current
package work is classified with no unmatched package path:

- the complete combined candidate contains 47 tracked and seven untracked
  package paths; its 445,754-byte raw binary tracked diff hashes to
  `cc3d143d922f0eeced3fc96232e08f5c44086831eb11e621bb40c42b2a08ecd0`,
  and its 4,891-byte ordinal content manifest hashes to
  `7580923865cee6c07d4a2d3c2bc883aa3b00d5a7aab8e79fb4545d3b7428d333`;
- the Gate 5 OAuth slice remains exactly ten tracked paths with 11,834-byte
  raw diff
  `456ddd6f9b31e092823b9e8142148198584ead1169ae2a0697aff6d201b5fe34`
  and current 893-byte content manifest
  `02d2b37d5036ee866e5df671d776d29294edfcd5ebce1d30bd650dcd81a96dab`;
- excluding those ten OAuth paths, the combined Agent-native Gate 14 plus
  Gate 8/12 correction candidate contains 37 tracked and seven untracked paths;
  its 433,920-byte raw diff hashes to
  `b6e27af5355ea46bc78528d1f484635f6008ab6a6c3a0f237a64707c5ce0b2dc`
  and its 3,998-byte content manifest hashes to
  `86f7033277e1d1ac0f82539264fc2bec8597a20f3b8adf1e2c26e6eaac625fb3`;
  and
- the superseding eight tracked Session lifecycle paths form an overlapping
  review projection, not a separately applicable patch. Their 72,811-byte raw
  diff hashes to
  `2825cc15c73260ac46dd43fe0721a97e9312e469ea7d2dc3cedd130dc3e51247`
  and their 692-byte content manifest hashes to
  `97f8ae086c64ed859232c13f5cd0f9289a47123d4934ee326da47ae3a6936db2`.
  These supersede the rejected `d2ae8bde...` / `86cf94a9...` closure
  candidate and the earlier `19f5e292...` / `09a950ed...` reviewed bindings.

Each manifest uses JavaScript default/ordinal path ordering and one UTF-8/LF
line per path:
`<40-hex git hash-object --no-filters output><two spaces><path>`, including one
final LF. The OAuth README formatting changed its no-filter working blob but
not the normalized raw Git diff; the current manifest above supersedes the
earlier `7a50cbd4...` content binding. The complete combined and non-OAuth
bindings above describe the now-superseded pre-review candidate and will be
rebound after the outstanding Gate 14 review repairs; they are not current
acceptance bindings. Staged path count is zero and no commit was created.

### Gate 12 final closure and Gate 14 superseding repair

Original Gate 12 reviewer task
`019fad21-8a6a-7450-af90-505c0bce53f8` returned final exact-diff `Accept`.
`G12-OH-001-R1` and `G12-OH-002` are closed. The accepted eight-path
owner-handoff projection remains 72,811 raw binary diff bytes with SHA-256
`2825cc15c73260ac46dd43fe0721a97e9312e469ea7d2dc3cedd130dc3e51247`;
its 692-byte ordinal manifest hashes to
`97f8ae086c64ed859232c13f5cd0f9289a47123d4934ee326da47ae3a6936db2`.
The reviewer reproduced the two idle-race cases / 17 assertions and prune
failure / 5 assertions; Session 33 / 234, Prompt 14 / 111, and Processor 30 /
158 remain the accepted executor evidence. The exact correction is integrated
at `29f5a140ffd9595a5de60d5bee517bba1b029cf2`; it contains no Gate 8
semantic hunk and no Gate 14/16/17 work.

The original Agent-native Gate 14 reviewer task
`019fb27f-4416-7c42-bcad-97d473803750` then carried forward three
implementation findings from the pre-repair candidate:

- `G14-STO-001`: V14 did not fail closed over the whole root/delegated
  `agent_action_v3` shape or the operation implied by its locators;
- `G14-STO-002`: current proposal preparation/recording functions remained
  exported even though the registry and durable producer were retired; and
- `G14-IN-001`: public V3 Tool input stripped hybrid legacy/authorization
  fields instead of accepting exactly set/clear.

The top-level executor repaired those boundaries without changing the accepted
contract. The versioned V14 trigger now validates the exact nested provenance,
lineage, delegated-capability rules, causal chain, effective fingerprint,
invocation binding, and operation. The V3 Tool uses a closed JSON schema and
runtime excess-property rejection while the generic inherited Tool path stays
open by default. Current proposal producer exports/code are gone; historical
read/replay and the reserved identifier remain. Positive V3 allow/no-change
and clear-after-withdrawal oracles close the two evidence gaps.

Fresh causal results are Core migration 39 / 341, migration `--check`, Core
typecheck, OpenCode runtime 45 / 791, registry 28 / 102, and direct Gate 14
Prettier check, all passing. OpenCode typechecking reports only unchanged
TUI-smoke fixture diagnostics; no Gate 14 path diagnostic remains. Runtime and
registry are run independently because combining their process-scoped
LearnerHome fixtures creates a non-causal database-owner collision.

Against base/HEAD `0d7ca3987ea69445d23f30ee8386706c0bbc86c9`, the
superseding Gate 14 package projection contains 30 tracked and seven untracked
paths. Its 422,498-byte raw binary tracked diff hashes to
`a7d7ffdfc0d21f0dbce59f15984900141f556df07db71829f3ce0b03aa50be30`;
its 3,372-byte ordinal content manifest hashes to
`a9233d6a74f2a204be06da0c50dda0a0d87c90ff97a04154147cd7ab78c04c55`.
The complete shared package tree now contains 49 tracked and seven untracked
paths, with 509,588-byte raw tracked diff
`16994af7f57713b920ff2d29a717f0ad29e4a419de930d0d3cc43d61e97bcd16`
and 5,057-byte ordinal manifest
`799481363166e4463b7f6d6cad9bb35eb397cd96e828974e9fc9d88d43bd2199`.
Every path is classified as Gate 5 OAuth (10 tracked), Gate 8 presentation
(one tracked), accepted Gate 12 owner handoff (eight tracked), or Gate 14
(30 tracked plus seven untracked). The manifest convention remains one
JavaScript-default/ordinal UTF-8/LF line per path containing the 40-hex
`git hash-object --no-filters` result, two spaces, and the path, including one
final LF.

At that checkpoint the Gate 14 candidate remained unaccepted pending
exact-diff closure by its original reviewer. Staged path count was zero and no
commit had been created; later residuals and final integration are recorded
below.

### Gate 14 locator-shape residual repair

Original reviewer task `019fb27f-4416-7c42-bcad-97d473803750` returned the
preceding candidate as `Revise`. It closed `G14-STO-002`, `G14-IN-001`, and the
two positive evidence gaps, but opened `G14-STO-001-R1`: the shared V2/V3
endpoint predicate did not close endpoint/locator objects or require and type
the recorded title, Course-version, and working-selection values. A valid V3
physical invocation against a real Course could therefore persist unknown keys
and missing values.

The superseding V14 candidate closes absent and Course endpoints, exact locator
keys, every `recorded_v2` value wrapper, and the complete working-selection
snapshot. Its SQL predicate is totalized so a missing JSON path cannot pass a
`CHECK` as SQL null. Current schema artifacts were regenerated, and the same
acknowledgement, disposition, and historical-proposal table shapes were folded
into the unaccepted V13→V14 migration rather than creating a V15 migration.
Historical bytes are preserved only when they satisfy their already-accepted
exact V2 contract; proposal production remains retired.

Red-first fresh-V14 evidence accepted the reviewer's malformed absent endpoint
before the repair. Final fresh and V13→V14 cases accept complete Course
locators and reject unknown or incomplete endpoint, locator, located-value, and
working-selection forms. Full Core migration is 39 / 346; migration `--check`,
Core typecheck, and OpenCode runtime 45 / 791 pass. Registry 28 / 102 remains
causally retained because no Tool/registry path changed. The two reviewer-noted
nonblocking evidence unknowns remain disclosed and outside this exact locator
repair.

The Gate 14 projection remains 30 tracked plus seven untracked package paths.
Against HEAD `0d7ca3987ea69445d23f30ee8386706c0bbc86c9`, its superseding
515,118-byte raw tracked diff hashes to
`5680e638cf6e0d65ae8b0e4178f68f2b4c8c789f6195ba4d8d2c6c9183e67cf0`;
the 3,372-byte ordinal manifest hashes to
`69c43283c0a8582f6ff34613c978424ae42725cb1ad515b0ba336833d92271a2`.
The rejected `a7d7ffdf...` / `a9233d6a...` binding remains provenance only.
OAuth, accepted Gate 12, and Gate 8 exclusions are unchanged. The candidate is
unstaged and unaccepted. The original reviewer returned this R1 binding as
`Revise`; the residual and superseding binding are recorded next. No Gate
16/17 authority follows.

### Gate 14 working-selection identity residual repair

Original reviewer task `019fb27f-4416-7c42-bcad-97d473803750` confirmed that
`G14-STO-001-R1` closed unknown keys, missing values, wrapper types, and
fresh/upgrade parity, but opened `G14-STO-001-R2`. The closed scalar checks
still allowed a working-selection snapshot whose `revisionID`, `viewID`,
`viewName`, `viewVersion`, and `revisionVersion` mixed null and recorded
members. That shape is impossible in the accepted semantic presentation,
which requires the identity tuple to be wholly absent or wholly recorded.

The shared exact V2/V3 endpoint predicate now owns that relational union in
addition to the already-closed object and scalar shapes. Red-first fresh-V14
and V13→V14 cases both accepted a null `revisionID` with recorded View members;
the upgraded path also accepted the converse recorded `revisionID` with null
View members. Final cases retain real owner rows and prove all-null and
all-recorded positives plus rejection of both mixed directions on both schema
paths. Current schema artifacts were regenerated and the change was folded
into the same unaccepted V14 migration; no V15 migration or registry entry was
created.

Focused fresh/upgrade evidence is 2 pass / 25 assertions. Full Core migration
is 39 / 352; migration `--check`, Core typecheck, OpenCode runtime 45 / 791,
direct formatting, and scoped diff check pass. Registry 28 / 102 remains
causally retained because this residual changes no Tool or discovery path. The
two previously disclosed nonblocking evidence unknowns remain unchanged.

Against HEAD `0d7ca3987ea69445d23f30ee8386706c0bbc86c9`, the Gate 14
projection remains 30 tracked plus seven untracked package paths. Its
superseding 557,013-byte raw tracked diff hashes to
`ff7b654f4c0a6372b717e3d16c5de0ead4c3d8b63ff7c410a9ed8e723e741ad6`;
the 3,372-byte ordinal manifest hashes to
`bedd4b47da66a2cec28ca3d1221213ba00f1c89aa4e55ba7004eae7c8f22aef7`.
The rejected R1 `5680e638...` / `69c43283...` binding is provenance only.
OAuth, accepted Gate 12, and Gate 8 exclusions remain byte-for-byte unchanged;
all 49 tracked plus seven untracked package paths are classified with no
unmatched path. At submission the candidate remained unstaged, uncommitted,
and unaccepted pending closure by the same reviewer.

### Gate 14 final Agent-native closure and integration

Original reviewer task `019fb27f-4416-7c42-bcad-97d473803750`
independently reproduced the R2 package, record, aggregate, and exclusion
bindings and returned final `Accept` with no blocker. `G14-STO-001-R2` is
closed, every prior Gate 14 finding remains closed, and the reviewer reproduced
the 2 / 25 owner-backed fresh/upgrade matrix, migration `--check`, absence of a
V15 artifact, clean diff structure, exact HEAD, and zero staged paths. The two
previously disclosed evidence unknowns remain nonblocking.

The accepted Gate 14 projection is locally integrated at
`ff0ef1fd7e0cbf048642fcb3ed1a8e32ba7f78db`. Its companion Gate 12
owner-handoff correction landed separately at
`29f5a140ffd9595a5de60d5bee517bba1b029cf2`. The ten OAuth paths and the
one Gate 8 oracle were excluded from both commits and remained dirty at that
checkpoint under their own review obligations. Their final closures are
recorded below. Gate 14 integration satisfied the then-accepted Gate 16 V14
predecessor dependency but granted no Gate 17 authority.

### Gate 5 retained OAuth final closure and integration

Replacement top-level reviewer task
`019fb7fb-c516-7ee0-9741-7760b0cd548d` independently reproduced the exact
ten-path OAuth binding and returned `Accept` with no blocker. The candidate
restores the released-v1 `CodexAuthPlugin` and existing Core browser/headless
registrations rather than adding a credential bridge, alternate runner, or
second authentication store. ChatGPT Plus/Pro and manual API-key methods remain
truthfully distinct; refresh retains the inherited Repa-owned credential and
request path. No Codex Desktop credential is read or copied, and no excluded
account/share/cloud/Web/Desktop/updater/release surface is reactivated.

The accepted package projection is 11,834 raw binary diff bytes with SHA-256
`456ddd6f9b31e092823b9e8142148198584ead1169ae2a0697aff6d201b5fe34`;
its 893-byte ordinal content manifest hashes to
`02d2b37d5036ee866e5df671d776d29294edfcd5ebce1d30bd650dcd81a96dab`.
The reviewer reproduced 44 tests / 68 assertions across Core, OpenCode, and
TUI. The maintainer-completed real login wrote exactly one `openai:oauth`
credential without an API key, and the unchanged released path completed the
four bounded Gate 14 model Turns. The exact correction is integrated at
`16b5589c144c61f8542a40554ea5169c3e0f8fe7`. The unverified xAI browser
referrer remains explicitly unclaimed.

### Gate 8 immutable presentation final closure and integration

Original Gate 8 reviewer task `019f68d9-5853-7e23-8592-dc41b90ac9bb`
returned final `Accept` and closed `G8-IMM-001`. The repaired owner is the
nullable `message.summary_diffs` projection beside immutable Message `data`.
The exact running Turn commits the current Session summary and its bound
per-message projection in one EventV2/SQLite transaction. Message-specific
reads use durable projection, then historical `UserMessage.summary.diffs`,
then best-effort Snapshot recomputation; an authoritative empty projection is
not confused with absence. Fork copies the projection and source-Session
deletion does not remove the clone.

Forward migration `20260731120541_gate08_message_diff_projection` advances the
current native database from V14 to V15 and backfills only exact historical
diff arrays without assigning to legacy Message data. The reviewer reproduced
the real U1/U2 plus missing-Snapshot cases at 3 tests / 22 assertions, the fork
case at 1 / 3, the focused migration case at 1 / 3, migration no-drift, and
format/diff checks. It retained the executor-bound complete migration 40 / 355,
Session 34 / 237, Prompt 14 / 111, Processor 30 / 158, and Core typecheck
evidence. OpenCode typechecking remains non-green only in the unchanged
`tui-smoke.tsx` fixture.

Against base `16b5589c144c61f8542a40554ea5169c3e0f8fe7`, the accepted
nine-tracked/one-untracked package diff is 29,847 raw binary bytes with SHA-256
`cc09ad480b516a1417971a19582d7981de390370bab0dd2759114d990eef56e8`;
the 888-byte ten-path manifest hashes to
`0b579eed7937f8824c94c2a67f0ebb238d501bc9528f8a971b87170daadad790`.
The reviewed Gate record diff hashes to
`e7a72f36ddf73ea9b567c5e6544981060a7c201f695628a7a5e2212556443982`,
and the complete 1,008-byte eleven-path manifest hashes to
`12db8c7a71d1623f41ea5d473cb0c90119e094ce2bc7961e3a32896fe1d20a7c`.
That exact candidate is integrated at
`19d0fe933`. This closure retains Gate 8's earlier settlement meaning and does
not reopen Gate 12, Gate 14, or learning-command domain semantics.

The V15 integration invalidated only Gate 16's derived migration predecessor
and numbering, not its accepted Agent-native Goal semantics. Original reviewer
`019fb2a3-c902-7882-8134-1bf33f1eb04d` independently returned `Accept` for the
mechanical repair. Against base `2307787fa17d8dfa19973b8b074cf9dbea1876df`,
the one-file raw binary diff is 3,978 bytes with SHA-256
`a3c7c4dc1c1a9b34cd385fb21bf62b31d614ef2c5362dec97aeacadcd44f6b89`.
The superseding three-file authority bundle against original base
`0d7ca3987ea69445d23f30ee8386706c0bbc86c9` is 99,027 bytes with SHA-256
`51fee3228f5b9808221ebaa4515e3eb9f19781681ce5cf422ef4b54a588c376f`;
its 301-byte ordinal content manifest hashes to
`5196d596c9a09d3cf5c4d7654b2b0fa7ad19075ad68991b7462f52f59a311d95`.

The exact accepted correction is integrated at `93e2412d3`. Gate 16 must
consume V15 and produce V16; all `G16-AN-001..003` semantics remain closed.
Scoped Gate 16 implementation authority is available. No Gate 17 authority is
inferred from either the Gate 8 integration or this mechanical correction.

## 2026-07-31 Gate 16 Agent-native implementation candidate

The top-level executor consumed exact base HEAD
`beebbc5d333109a6fdc301aab49995c223104f71` and implemented only the accepted
Gate 16 V15-to-V16 boundary. The candidate publishes bounded zero-write Goal
reads and one closed semantic-intent write, binds runtime-owned identity,
version, temporal, root/delegated Agent-issuance, permission, semantic-first
replay/recovery, and complete revision facts, preserves exact V1 history as
replay-only state, and retains the existing configured-`ask` and typed terminal
carrier. Gate 17 and the retained Gate 5/8/12/14/15 boundaries are unchanged.

The exact unstaged package projection is 31 tracked plus eight untracked paths.
Its 713,644-byte raw binary tracked diff hashes to
`38f9a3dac395ba426c9055bc317b1ceb15ea8b7a959a4a5a767dc7fb99d7f5fb`;
its 3,466-byte 39-path ordinal UTF-8/LF Git-blob manifest hashes to
`eacb9ac968b8557c9c3b7d0fbc434caddc2b473829cb85bdd5c75315657f47a7`.
The Gate record defines the exact manifest convention and records the
deterministic and released-model evidence.

Fresh causal checks pass: Core V2 Goal 5/33, database migration 41/366,
OpenCode runtime 46/881, semantic presentation 7/63, registry 29/134, prompt
14/111, Schema wire 4/11, and primary-TUI permission/result 1/12; migration
drift plus Core/Schema/TUI typechecks and scoped formatting/diff checks pass.
OpenCode's full typecheck still reaches only the unchanged
`specs/fixtures/tui-plugins/tui-smoke.tsx` diagnostics and no Gate 16 path.

The exact formatted real-model script
`7088a72995108f9e69617d08bbd3b4c2c3170e95586ff159b98e1459a30c6fe0`
completed six isolated released-v1 Turns through inherited Repa OpenAI OAuth
and `openai/gpt-5.5`. It produced three V2 candidates, policy allows, effects,
and revisions, zero permission issues, and zero historical command rows while
covering discussion/no-write, natural creation, cross-Session contextual
update, suggestion/no-write plus short acceptance, and ambiguity clarification.
The secret-free evidence, database, and clean runtime-log hashes are
`66faec3cb0aefa6a49047cfdac9f00cec4d69d8178335355219a51030ef42ddf`,
`5091549a7f565f6e5ca34588c6a7cea9b99c237c68b56efdefe2aa972b264eb5`,
and `e9c0ca7fcc6f0fb4dfc784286651510f18a82d201e650fed6722b6cb9adc804d`.
Integrity and foreign-key checks pass, and credential-canary hits are zero.

This records a candidate, not acceptance. Original fresh reviewer task
`019fb2a3-c902-7882-8134-1bf33f1eb04d` must close the exact implementation and
evidence before staging or integration. No Gate 17 authority follows.

### 2026-08-01 Gate 16 first implementation-review repair

The original reviewer independently reproduced the candidate above and
returned `Revise` with `G16-AN-IMP-001..003`. It found that mixed changed and
no-change V2 operations rolled back under the V16 effect-operation trigger;
the wildcard Core package export still exposed the retired V1 confirmation and
write producers through the current `LearnerGoal` namespace; and a pre-epoch
civil instant crossed candidate admission before conflicting with the
nonnegative stored target domain. The accepted Agent-native contract,
V15-to-V16 predecessor, migration/replay/provider boundaries, and Gate 17
exclusion remained closed.

The top-level executor repaired only those seams. V16 now distinguishes a new
changed revision from the exact unchanged predecessor in one materialized
effect; the public Goal namespace is a narrow read/replay facade with producer
and implementation subpaths blocked; and fixed-offset plus IANA pre-epoch
instants settle as typed validation no-effects before candidate creation. The
red-first counterexamples now pass. Fresh causal evidence is Core Goal 6/43,
database migration 41/366, OpenCode runtime 46/881, registry/package
reachability 29/142, migration no-drift, and Core typecheck. OpenCode
typechecking still reaches only the unchanged `tui-smoke.tsx` diagnostics.

Against unchanged HEAD `beebbc5d333109a6fdc301aab49995c223104f71`, the
superseding 31-tracked/nine-untracked package projection is 715,362 raw binary
diff bytes with SHA-256
`86e336d855392ec9e6f0135e45e3ad308cfdafeae5b92aa7170fb42d6b3fe409`;
its 3,550-byte 40-path ordinal manifest hashes to
`dd8e90817944f42ba7a841455f09edb7630f8c55038ac3d26070ea09fe5c50d9`.
The first reviewer bindings are rejected provenance only. The same reviewer
independently reproduced every superseding binding, reran Core Goal 6/43 and
registry/package reachability 29/142, and returned `Accept` with no blocker.
`G16-AN-IMP-001..003` are closed. At review time, its only nonblocking note was
that the temporal matrix approaches Bun's default five-second timeout when run
concurrently with the unrelated registry suite; the exact Core command passes
alone.

The accepted 43-path candidate was integrated without content drift at
`2baba9eeabeb9f163cfe380009dbb07673e3a669`. Gate 16 is closed at its
Agent-native Goal boundary. Gate 17 remains unstarted and unauthorized.

## 2026-08-01 post-Gate-16 status and evidence maintenance

The status owner, Roadmap 09, Gate 17 draft, and pre-Gate-17 hazard audit now
agree that Gate 16 is closed, Gate 17 is unbegun and unauthorized, and `/learn`
is never a mandatory or authoritative bootstrap envelope. Retaining it as an
optional discoverability shortcut or omitting it remains the only local Gate 17
design choice.

Fresh sequential Windows/Bun `1.3.14` verification showed that the complete
Core invalid-temporal matrix and OpenCode historical V1-to-V2 target-carry
matrix can exceed Bun's default five-second per-test timeout without an
assertion failure. Their maintained test-local budgets are now 15 seconds. The
direct Core Goal command passes 6 / 43 and the direct OpenCode runtime command
passes 46 / 881 with 13 intentional historical-V1 producer skips. The retained
TUI smoke fixture now targets the current plugin slot and Prompt APIs; OpenCode
package typechecking passes. No production path, accepted Gate contract, or
Gate 17 authority changed.

## 2026-08-01 pre-Gate-17 identity and inherited-corpus cleanup

Maintenance commit
`bc9c870b3dff5ab7f161f97f618379d5b0c22ab1` removes the current-tree
upstream product/documentation corpus without rewriting the accepted fork
history. Its exact Git projection is 916 changed files, 171 insertions, and
238,151 deletions. The removed material includes all 704 tracked
`packages/web` paths, all 58 inactive upstream workflow/support paths, 21 root
localized READMEs plus `STATS.md`, old root plans and preview-v2 prose,
source-local READMEs for excluded product surfaces, retired upstream
Nix/release packaging, the App translation corpus, and the unreachable
OpenCode-configuration skill. The exact pre-cleanup tree remains recoverable at
`022c8cb21aaf24dad254b654464f59b771acaee8`; ignored generated Web build and
dependency artifacts were removed locally, are rebuildable, and were never
part of Git history.

The cleanup also removes upstream Schema URLs from the active TUI themes and
fixtures, renames the built-in theme and Gate 17 draft to Repa-owned paths,
removes the stale editor-autocomplete claim, stops the retained Console sitemap
from reading the deleted Web package, updates current repository metadata, and
shrinks the Bun workspace lock. Deleting the Web workspace exposed an old CLI
test-harness dependency on React: subprocesses launched from an isolated
learner directory could not discover the package's Solid JSX setting. The
fixture now passes Bun's Solid JSX import source explicitly across spawn, run,
serve, and ACP paths; no production CLI behavior changed.

The root, HTTP-recorder, and UI MIT texts remain byte-identical at SHA-256
`b5c625d157735f04e1b2b7ceccee849130b554bdb23cd58db55a38a257efbbdd`.
The new root fork notice records the upstream pin and current repository, and
the release build copies both `LICENSE` and `FORK-NOTICE.md` into each binary
distribution. Internal `@opencode-ai/*` package names, `packages/opencode`,
provider/protocol literals, compatibility keys, test fixtures, and historical
Gate/provenance names remain only where they carry a legal, package, wire, or
evidence contract; they are not current Repa product identity.

Fresh causal evidence passes: frozen Bun lock installation; TUI theme/config
19 tests and typecheck; Console App, Core, and OpenCode package typechecks;
focused Core configuration-skill absence; OpenCode TUI config 37, run-theme 7,
skill 21, help 2 with 28 snapshots, and one each of subprocess run, serve, and
ACP coverage; 35 JSON parses; 19 changed-document relative-link checks; scoped
Prettier and Git diff checks. A single-platform packaged build using the
repository's frozen model-catalog fixture passes executable, ContentRoot, local
PDF, worker-cancellation, and exact legal-file checks. The live models.dev fetch
was unavailable, so this is build-composition evidence rather than a current
release artifact. Nix is unavailable in this environment and no Nix evaluation
is claimed; the flake now exposes only the retained development shell.

A complete root Turbo typecheck is also not claimed green on this Windows
checkout: the retained hibernated Enterprise package's tracked mode-`120000`
`src/custom-elements.d.ts` link is materialized by this checkout as its
33-byte target-path text, which TypeScript rejects. Its content and Git mode
predate this maintenance commit, and directly affected package typechecks pass.
This cleanup changes no accepted Gate contract or product loop. Gate 17 remains
unbegun and implementation remains unauthorized.

## 2026-08-02 Gate 17 maintainer decision and contract acceptance

The maintainer closed Gate 17's only remaining product choice: the baseline
omits built-in `/learn` and uses the ordinary interactive Agent as its sole
open-language bootstrap entry. This decision does not permanently prohibit a
future shortcut; one would require new evidence and a separately accepted
boundary. A configured, plugin, skill, or MCP command spelling supplies no
bootstrap authority merely by expanding to prompt text.

Against clean base
`d104789dfd601e55ef1f5d281b4349670f5c3c93`, the executor derived the
`G17-BS-001..008` contract candidate. It defines bounded zero-write owner
reads, one request-bound closed Course/View/material bootstrap set,
semantic-first Gate 8 replay/conflict and capability settlement, atomic local
composition only for jointly knowable and authorizable consequences, truthful
staging for external or result-dependent work, explicit exact material
adoption, optional working-selection/route-anchor consequences, durable typed
receipts, recovery, and same-Turn teaching. Its material path now preserves
Gate 10's complete local-read authority union (an approved ContentRoot, the
active execution workspace, or an exact one-operation learner grant) and exact
root-object/path preparation, and one admitted model operation may commit at
most one new Artifact mutation. Default Course, Goal, steering, Session/macro
activity, Context, and later product-loop behavior remain separately owned.

Fresh independent reviewer Dispatch `ctx_c8328a7778c0` reviewed exact candidate
`2c2b1be0cb37d6196efe9c9e63313a47214f6263` and returned two accepted
conflicts. F1 found that the candidate had narrowed Gate 10 local-read authority
to an approved ContentRoot instead of preserving the complete accepted union.
F2 found that a bounded local material set could admit multiple potentially
mutating new Artifact targets in one provider-visible operation despite Gate
10's one-new-Artifact ceiling. Semantic repair commit
`2d890df54a342590d36172c80c8aab1e56da85e3` restores the full exact union,
limits a bootstrap to one potentially mutating new local target, and requires
additional new sources to settle through fresh admitted Gate 9 model operations
before a later bootstrap references their exact Artifact Revisions or
separately accepted Gate 11 Representation Revisions. Its
Course/View/Map/alignment/selection/anchor atomicity and every separate owner
boundary remain unchanged.

Original-reviewer closure Dispatch `ctx_b5ec7c6d7169` confirmed F1/F2 were
semantically repaired but required the current status projections to stop
claiming that the candidate had not entered review. Status repair commit
`cf0cfbd032273cf7360fe7747ef0809abda6181f` corrected `docs/README.md` and the
Gate 17 record without changing a contract clause. The same original reviewer
then returned final exact-binding `Accept` in Dispatch `ctx_475d85cda99f`,
explicitly accepting contract commit
`cf0cfbd032273cf7360fe7747ef0809abda6181f` with no remaining finding.

The accepted contract reconciles the status owner, Gate 17 record, and only the
stale current-disposition projections in the pre-Gate-17 audit. Roadmap 09's
stable topology and evidence boundary already agree and remain unchanged.
Historical audit and decision statements remain provenance for the state that
existed when they were written. No production source, schema, migration,
package test, provider run, staging area, or integration branch changed.

Scoped Gate 17 implementation authority is available only against exact
contract commit `cf0cfbd032273cf7360fe7747ef0809abda6181f`. No Gate 17
implementation, implementation evidence, or integration is yet accepted. The
next control point is the exact Gate 17 implementation/evidence candidate, not
Gate 18.

## 2026-08-02 Gate 17 implementation/evidence candidate

The single top-level executor consumed exact base
`822f8a3df4baa5b51002e7ffd8118a01d567c2a0` and exact accepted contract
`cf0cfbd032273cf7360fe7747ef0809abda6181f`. The containing commit, supplied
exactly in the executor callback, implements the V16-to-V17 generated migration
and fresh-schema parity; bounded Course/navigation and material owner reads;
one closed V1 `update_learning_course` write; the three-arm Gate 10 local-read
union and one-new-Artifact ceiling; owner-private Course, Artifact, Material
Map, alignment, selection, and route-anchor composition; Gate 8 physical and
semantic ordering, root/delegated issuance, capability settlement, commit
seal, and recovery; and one typed TUI/direct-run/ACP terminal projection.

The candidate adds no `/learn`, privileged learn envelope, parser/classifier,
second model call, controller/workflow framework, default-Course mutation,
Goal, steering, progress/mastery, Session topology, queue/steer, macro
activity, Context, Tutor selector, or product-loop behavior. A Course without a
View and a zero-write teaching Turn remain legal. Additional external,
long-running, separately authorized, result-dependent, or potentially mutating
new material work remains independently staged and receipted.

The exact implementation and evidence mapping are recorded in
`docs/research/repa-gate-17-natural-language-learning-bootstrap-implementation-evidence-2026-08-02.md`.
Fresh Windows/Bun `1.3.14` evidence includes Core bootstrap/migration 49/476, a
post-repair owner aggregate of 72/675, OpenCode Gate 17 runtime 3/20, affected
registry/presentation/ACP/direct-run 74/322, Schema semantic wire 4/11, TUI
semantic projection 5/18, migration drift, and Core/Schema/OpenCode/TUI
typechecks.

No provider credential, paid call, or external write was used. Deterministic
ordinary-Agent fixtures qualify the production admission, permission,
transaction, replay, carrier, and recovery mechanics; the bounded released-v1
real-model language/product traces remain for authorized independent review.
This record is an executor candidate, not independent acceptance or
integration, and grants no Gate 18 authority.

### 2026-08-03 Gate 17 finding closure and released-v1 qualification candidate

The original fresh implementation reviewer first closed `G17-IE-001`,
`G17-IE-003`, and `G17-IE-004` on exact candidate `bd092577`, then accepted
`G17-IE-002` on direct descendant
`23a192c72489e3638a6eddeb6925a9efe6da381e`. The latter preserves Gate 17's
500 proposed-item ceiling while admitting the Course owner's complete legal
1024-member and 1024-mapping-group transition facts through the typed
permission/carrier scope. All `G17-IE-001..004` findings are closed.

After that closure, the maintainer authorized the accepted contract's minimum
released-v1 real-model trace set through the already configured local provider.
The first provider attempts exposed an environment fact: Bun did not inherit
the Windows system proxy. Projecting the existing credential-free loopback
proxy only into the qualification process restored the ordinary provider path;
no persistent provider, credential, proxy, or repository configuration changed.

One subsequent bounded trace produced an exact `error/interrupted` settlement
for an admitted correction tool, with no receipt, effect, seal, or partial
Course mutation. The Agent read the durable state and attempted a retry, but
the temporary runner's artificial eight-tool ceiling stopped that Turn. A
separate ambiguity trace proved that ten nonduplicate bounded reads can be
necessary. The runner ceiling was therefore corrected to twelve. The exact
low-level exception could not be recovered because the learner-safe failure
path discarded it, so runtime candidate
`be6e78d14adb3d59f674320610ae305bd1502140` adds a structured internal error
log before preserving the existing `interrupted` settlement. OpenCode
typechecking and the focused admitted-learning-tool failure oracle pass; two
instrumented full traces and the final clean trace then completed without a
tool failure.

The final clean `openai/gpt-5.5` trace binds exact candidate `be6e78d14`,
released-v1 runtime `latest` / `1.17.18`, default HTTP transport, and the
ordinary Agent path. Seven normal completed Turns across five isolated Sessions
cover corrected fresh creation and same-Turn teaching, post-commit same-route
successor correction, a distinct reversible unselected View, clarification
before ambiguous material adoption, exact teach-only continuation, allowed
one-operation local material adoption, and rejected adoption with truthful
continuation. Twenty-five model operations completed with no assistant error.
Four command invocations applied and one settled `permission_rejected`; the
database contains four matching receipts/effects/seals, no running tool, and no
foreign-key violation. Both one-operation prompts preserve an empty `always`
set, exact-reply lifetime, valid TUI semantics, and ACP choices exactly
**Allow once** and **Reject**. TUI, direct-run, and ACP terminal projections
agree for every command.

The secret-free evidence JSON is 519,495 bytes with SHA-256
`16bf2cc1f4ec23ceb16544418607659a2643c38eafe596a40efd07856dfba089`;
the 4,063,232-byte trace database hashes to
`cf7bd173e066ad87b0b704a037d1904f0e7aa1083ec2da71f9911043c8f9f030`.
The archive, negative predecessor, exact bounds, usage, and final-state proof
are recorded in
`C:\Users\Discordance\.codex\campaigns\repa-gate17\evidence\reports\repa-g17-ie005-codex-recovery.md`.
No credential file or value was manually inspected, printed, copied, modified,
or newly configured; the ordinary provider path consumed the already configured
local OAuth authority. No push, publish, or deploy occurred.

Original fresh reviewer task `019fc311-9714-7eb3-a5f7-045ecf66a1a7` then
returned explicit **Accept** for exact candidate
`39a8c2f4f2ad7b2d920c33859258ab4c56d797fa`, closed `G17-IE-005`, and accepted
the complete Gate 17 implementation/evidence candidate for local integration.
The reviewer independently matched the archive hashes and queried the raw
databases rather than accepting the report summary. It confirmed seven normal
learner Turns, 25 completed real-model operations, 30 completed tools, no
assistant error or foreign-key violation, four exact receipt/effect/seal chains
plus one effect-free rejection, correction history, settlement-before-teaching
ordering, exact once-only permission semantics, carrier agreement, and the
adopted material's byte hash. The negative trace retained exactly the original
Course/View/Revision and receipt/effect/seal after the separate correction
invocation settled `error/interrupted`; its retry was never admitted after the
qualification-only tool ceiling. The focused diagnostic failure oracle passed
freshly, and no descendant evidence reopened `G17-IE-001..004`.

The accepted production tree entered `main` when it was fast-forwarded through
closure/status commit `506b420cf`; all changes after exact accepted candidate
`39a8c2f4` are documentation-only. This ledger update records that mainline
integration and changes no implementation. Gate 17 is closed at the accepted
candidate boundary. Gate 18 now has its roadmap predecessor and is ready only
for its own local design/evidence grill; no Gate 18 contract or implementation
authority follows automatically. The qualification's nonclaims remain
explicit: it does not establish exhaustive
language interpretation, pedagogical efficacy, reliability qualification,
release readiness, or Gate 23 product-loop closure.

## 2026-08-05 Gate 18 contract and implementation/evidence acceptance

Against detached base `862f6b7a2318f0ccce4e98dd5ea6fab136739628`, the
executor derived Gate 18's bounded, immutable, operation-exact learning-context
and Session-continuation contract. Fresh separate top-level reviewer task
`019fc874-72ee-75b3-92e9-0b923b85efb2` reviewed both Gate layers under
`G18-WG-20260804-019fc837-01`. Contract corrections separated provenance from
current read authority, preserved Gate 13 current-use semantics, bound the
complete final provider-visible surface, and kept full tool-definition bodies
outside Gate 18's local 32-KiB cut. The reviewer closed `G18-CR-001..004` and
accepted exact semantic candidate SHA-256
`2DDAA56396621CA04FBDE320F2B221CFCD8F844797F5C33B9E7AFF81CA46FB26`
on 2026-08-04.

The same reviewer then inspected the uncommitted implementation and evidence.
Successive corrective passes closed `G18-IR-001..008`: the final request surface
and route are exact and nonsecret; pre-admission compilation and verified open
fail closed; capacity and compaction share one causal history boundary; active
Turn input/model ordinals own the provider suffix; capacity persistence states
its two-stage truth; provider tool-name projection cannot retarget an external
fallback; the inert AI SDK fallback requires exact one-use repair provenance;
and colliding raw MCP origins fail before catalog admission. No Gate 19–23
state, Tutor move selection, second runtime, or domain write entered Gate 18.

The maintainer separately authorized one bounded credential/cost-bearing
qualification against the already configured `openai/gpt-5.6-luna` route. Its
secret-redacted immutable bundle records 22 scenarios, 57 completed interactive
model operations and matching Gate 18/capacity rows, 62 captured provider
attempts, 23 completed Turns, TUI/direct-run/ACP parity, database
`quick_check=ok`, and zero foreign-key violations. Exact evidence JSON SHA-256
is `E63A11BD43215DF61010CF9981F7547CE94B9AEBE68CCADFB535FC52E810F0CB`;
the final trace database SHA-256 is
`4773B8C17D8198AAE9B77FA80157CC44BC93ACF2165BED30BCAFCC399749A222`;
and the 41-file evidence manifest SHA-256 is
`D84C088368E4F982C2CACBCDC89AAE6DA6F0510F82B51512CFB715F97DE8D98D`.
The exact model was discovered through the ordinary provider catalog; no Luna
model-name special case entered production.

On 2026-08-05 the same reviewer returned final **Accept** for review-bound
manifest SHA-256
`733137B901BD476B59AAF4C48760E1127CF1613D115D581D24B8B935BCE8C078`
and tracked binary-diff SHA-256
`FD4854C9AFD74516FB27CA894FDC935910F3515D31EBDABC7E3DD9E24746E61F`.
Both Gate 18 review layers are accepted with no acceptance-changing finding or
material unknown remaining. The maintainer then separately authorized local
integration. Exact implementation commit
`284d2a4ae440fb01f0f5a32eca58a5948464cc5e` contains the reviewed
production/test projection plus post-verdict status records; `main` was
fast-forwarded through its docs-only closure/status successor. No production or
test content changed after reviewer acceptance, and no push, release, or
later-Gate authority follows.

## 2026-08-06 Gate 19 contract and implementation/evidence acceptance

Against exact base `8ababa1ee53cd0907056f33812621142538807dd`, the executor
first tried to falsify Roadmap 09's candidate Gate 19 rather than deriving a
learner schema from the Gate number. Exact source-readable controls were
negative; after legal source-Session deletion, the bounded fixture produced a
later-action collision that existing Course, navigation, Goal, steering,
Material/current-use, Interaction, and Gate 18 reads could not distinguish.
Collision-result SHA-256 is
`7A8F7A64AE83BD402C858BC62410DEED484E3F383262B68B0B7E765D4B602A0D`.

Whole-Gate review run `G19-WG-20260805-019fd20c-01` retained independent
reviewer task `019fd269-e042-7423-85a9-bce7121f9b6e` across both layers. Two
contract/theory `Revise` passes forced an occurrence-plus-exact-selector/Course
effect address, source-unavailable-only automatic pressure, ablation of
unconsumed uncertainty states, and a program-enforced operation/basis/source
matrix. The reviewer closed `G19-CR-001..005` and accepted semantic candidate
SHA-256
`E3630BD59EAE438251EA09660FEF99127292E388B16CC5F25110DCA9AA9E79DF`.
The accepted contract review-record SHA-256 before integration-only status
reconciliation is
`47A7BACEE1448800AE207E65D57B07A1B429F6B05DE197B2505232A7C2B38F84`.

The first implementation/evidence review returned `Revise` for ten bounded
compatibility, causal-order, SQL-authority, ownership, presentation,
source-deletion admission, pre-write validation, causal composition, recovery,
and evidence-record defects. The executor repaired those defects inside the
accepted boundary. The same reviewer then closed `G19-IR-001..010` and returned
final **Accept** with no new acceptance-changing finding, owner blocker, or
execution failure. The exact reviewed production/test projection is 38 files /
4,538 canonical manifest bytes with SHA-256
`29323F3D019C1F8115545374B4AFD8C9107C53E7FE64C875947495548329CF4A`;
the accepted implementation/evidence record SHA-256 before integration-only
status reconciliation is
`09F13862AC1339D6E3A4440C5752E96DC8EE554ED8415BEB6825DAFD8C41FA56`.

The reviewer independently reproduced the six isolated Core semantic cases,
the migration check and frozen Gate 18 compatibility case, Gate 19
runtime/recovery, semantic presentation, exact request/provider composition,
the deletion/admission interleaving, the real stored-state SessionPrompt join,
and `git diff --check`. Bun 1.3.14 on Windows still has an unknown-frequency
native segmentation-fault risk in aggregate attempts; no independently
selected isolated oracle produced a semantic assertion failure. This limits
aggregate execution-reliability claims rather than the accepted Gate 19 domain
boundary.

The maintainer then separately authorized integration and push. Exact
implementation commit `9027b45a4853165b18b2c2697e727a066f6c7c22` contains
the accepted production/test projection and three review records; `main`
includes it through this docs-only closure/status successor. The pre-existing
maintainer-owned `AGENTS.md` modification was excluded. No production or test
content changed after reviewer acceptance, and no release, Gate 20+, production
move-selection, representative-model-quality, or educational-efficacy claim
follows.

## 2026-08-06 Gate 20 opening and contract/theory candidate

The maintainer authorized the complete Gate 20 horizon against exact base
`3317525aeb242dfcf3cec49c0dd627cd38ee8144`, while withholding commit, push,
release, credentialed provider, and later-Gate authority. The pre-existing
maintainer-owned `AGENTS.md` modification is excluded. Review run
`G20-WG-20260806-019fd69a-01` uses one fresh top-level reviewer for both the
contract/theory and later implementation/evidence layers; implementation may
begin only after that reviewer accepts the contract layer.

The opening correction withdraws all proof claims based on historical
ALS-021/022 aggregate results. Tracked prompt-injection code, a runner, and
shallow mechanical checks remain reachable, but the raw `.runs` behind the
published aggregates are absent from the current repository and immutable
oracle tag. Those documents remain unqualified design provenance. The current
[Gate 20 contract candidate](research/repa-gate-20-source-linked-future-attention-2026-08-06.md)
instead derives target, time, authorship, change-set identity, lifecycle,
conditional/multiple composition, truthful service, and evidence from accepted
owners, first-principles counterexamples, and current-fork qualification.

Retained reviewer task `019fd773-84c3-7841-9fc5-45f1b18d4a9f` returned first-pass
`Revise` at the contract/theory layer with five acceptance-changing findings:

- `G20-CR-001`: learner-occurrence-only service could not truthfully bind a
  complete explanation or returned delegated result;
- `G20-CR-002`: universal IANA/release provenance fabricated a zone for valid
  fixed-offset instants;
- `G20-CR-003`: exact excerpt binding did not assign fallible open-language
  source-relation interpretation to the ordinary Agent;
- `G20-CR-004`: replacement always reopened served/dismissed concerns and could
  invent future pressure during record correction; and
- `G20-CR-005`: a 2,048-byte purpose could not fit Gate 18's 2,048-byte
  canonical semantic-entry ceiling with the other mandatory meaning.

The production checkout remained unchanged by that reviewer, exact base/HEAD
and `origin/main` remained `3317525aeb242dfcf3cec49c0dd627cd38ee8144`, and
the disclosed maintainer-owned `AGENTS.md` modification remained excluded.

The executor repaired those five findings with a closed purpose-appropriate
complete Interaction source union and root-only completion-conditioned
Assistant finalization; Goal-compatible tagged fixed-offset versus IANA/release
provenance; Agent-authored semantic source relations separated from runtime-
proven source/identity/permission facts; explicit successor arms including
served/dismissed terminal carry; and a 768-byte purpose within Gate 18's
2,048-byte semantic-entry ceiling plus maximum-value and comparative-cost
oracles.

On the first closure pass, the same reviewer closed `G20-CR-001..005` and
returned `Revise` with two new acceptance-changing findings:

- `G20-CR-006`: Tutor-initiated creation remained uncorrectable without falsely
  presenting a generic current learner occurrence as learner direction; and
- `G20-CR-007`: one input could not truthfully replace open A with B and bind
  the completed current Assistant explanation to the generated B successor.

The reviewer made no candidate, production, index, history, or external-system
mutation. `HEAD` and `origin/main` remained
`3317525aeb242dfcf3cec49c0dd627cd38ee8144`. The excluded maintainer-owned
`AGENTS.md` hash had changed before the closure pass began but remained stable
during that pass and did not affect the verdict.

The executor repaired those findings with `agent_correction`: an authorized
root or capability-bounded delegated Agent may replace, dismiss, or reopen its
earlier fallible durable interpretation without borrowing learner assent, while
learner direction and service remain root-only. Root-only nested
`serve_complete_source` and `serve_current_assistant_when_complete` replacement
arms let one atomic admission supersede A and create B without exposing its
generated ID; an already-complete source may serve B immediately under strict
chronology, while failed Assistant completion leaves B open.

On the second closure pass, the same reviewer kept `G20-CR-001..005` closed,
closed `G20-CR-006..007`, and returned `Revise` with one new
acceptance-changing finding:

- `G20-CR-008`: the candidate required exact replay of the original physical
  invocation to refresh its pending claim into the later current
  `served | not_served` state, contradicting Gate 8's immutable stored-result,
  no-domain-read replay boundary and the current LearningCommand substrate.

The reviewer made no repository, index, history, or external-system mutation.
`HEAD` and `origin/main` remained
`3317525aeb242dfcf3cec49c0dd627cd38ee8144`, the index remained empty, all target
and dependency hashes/status entries remained stable, and the excluded
maintainer-owned `AGENTS.md` remained at SHA-256
`540417b5b646a3232452004482237166d79a418e790de7ff363f088b15bb5421`.

The third closure pass closed `G20-CR-008` and returned `Accept` for the then-
current contract/theory candidate. The reviewer independently confirmed that
the phase-one Gate 8 physical settlement and completed Tool Part remain exact,
while the unique append-only FutureAttention finalization receipt/event owns
later truth. Exact physical replay remains byte-identical and performs no
domain read; a bounded owner read or physically new semantic duplicate exposes
current state. `G20-CR-001..007` remained closed and no new finding was reported
in that reviewed candidate. The reviewer made no repository, index, history, or
external-system mutation; `HEAD` and `origin/main` remained
`3317525aeb242dfcf3cec49c0dd627cd38ee8144`, the index remained empty, and all
frozen target/dependency hashes and status entries matched its dispatch
baseline.

Before production implementation began, read-only current-fork mapping exposed
a distinct released-v1 execution identity that the accepted wording had not
made explicit. `SessionPrompt` creates a new Assistant message for each provider
loop; the Assistant A1 that owns the local claim tool call is settled together
with its tools and committed as one durable presentation, while continuation
after `tool-calls` may create a later Assistant A2. Returning the last Assistant
from the Turn therefore cannot identify A1. This reopened the layer as
`G20-CR-009`: binding A1's pending claim to A2 would record service against the
wrong model operation, while excluding every byte streamed before A1's tool
call would make an otherwise complete same-message explanation impossible to
serve.

The current repair binds a completion-conditioned claim only to the exact root
Assistant message/model operation that owns its local tool call. Text Parts
streamed before that call are not independently complete; they and any final
Assistant-level structured output may contribute only after the whole same
presentation, all local tools, all terminal Parts, and the final Assistant
projection commit. Reasoning, tool results, patches, provider deltas, and later
Assistant messages are excluded from its eligible output fingerprint. Live
finalization occurs at that exact full-presentation cut and before another
interactive model admission; startup finalization follows Turn recovery. If A1
has no eligible output, its claim finalizes `not_served`; A2 cannot silently
substitute.

The closed `G20-CR-009` repair preserves the phase-one Gate 8 physical
settlement and completed Tool Part exactly. It records only that the admission
committed and observed the new claim pending at that immutable cut. Later
`served | not_served` truth belongs to a unique append-only FutureAttention
finalization receipt/event; current observation comes through that event,
`future_attention_read`, or a physically new `already_applied` semantic
duplicate. Recovery finalizes pending domain groups without reopening or
rewriting terminal physical invocations, and retained carriers present the
historical admission separately from the later finalization/current projection.
Roadmap and status projections carry the same boundary.

The fourth closure pass closed `G20-CR-009` but opened `G20-CR-010`. The reviewer
confirmed that every later released-v1 Assistant/model operation under the same
current Turn input copies the same runtime-bound learner occurrence. A1 has
therefore already consumed its `occurrenceID` plus
`future_attention_change_set` slot: a same-input A2 physical invocation that
reproduces A1's full canonical payload is `already_applied`; an A2-bound source
or other changed service/rebind intent is `semantic_conflict`; and the
unique terminal group cannot be finalized or rebound again. The rejected
fallback would require a fabricated occurrence, weaker identity, mutable group,
or a new continuation/service-retry slot that the closed operation union does
not define.

The current repair removes that fallback instead of adding another identity.
If A1 finalizes `not_served` and A2 first contains the explanation, A2 may answer
the learner but cannot record service under the already-settled occurrence; the
concern remains open. Only a genuinely new runtime-bound learner occurrence may
issue another legal change set and serve through its own legal source. The
negative A1/A2 trace now proves this terminal truth rather than promising
no-new-message recovery. The reviewer made no candidate, production, index,
history, or external-system mutation; `HEAD` and `origin/main` remained
`3317525aeb242dfcf3cec49c0dd627cd38ee8144`, the index remained empty, and all
frozen target/dependency hashes and status entries matched.

The fifth closure pass closed `G20-CR-010` and returned `Accept` for the complete
contract/theory layer. The reviewer confirmed that a real learner steer is
separately admitted as a learner occurrence and atomically becomes the current
Turn input, while ordinary A2/A3 continuation retains the earlier occurrence.
All owning projections contain no positive residual A2/no-new-message fallback;
`G20-CR-001..009` remained closed and no new acceptance-changing finding was
reported. The reviewer made no candidate, production, index, history,
credentialed-provider, or external-system mutation. `HEAD` and `origin/main`
remained `3317525aeb242dfcf3cec49c0dd627cd38ee8144`, the index remained empty,
and all frozen target/dependency hashes and path entries matched.

Gate 20 contract/theory is therefore accepted with `G20-CR-001..010` closed.
The prior Whole-Gate authorization permits implementation/evidence to begin;
reviewer task `019fd773-84c3-7841-9fc5-45f1b18d4a9f` remains reserved for that
separate layer. No implementation/evidence acceptance, integration, commit,
push, release, or Gate 21+ transition follows from this verdict.

## Gate 20 implementation/evidence candidate — 2026-08-07

The top-level executor implemented the accepted source-linked FutureAttention
boundary against unchanged base
`3317525aeb242dfcf3cec49c0dd627cd38ee8144`. The candidate adds the native Core
authority, tagged civil-time computation, V20 migration and generated schema,
Learning Context v3 projection, strict OpenCode write/read tools, exact-
Assistant completion finalizer and startup recovery, typed finalization event,
semantic presentation, generated SDK projection, and TUI/direct-run/ACP
carrier delivery. The implementation does not rename the todo tool, create a
universal Agenda, add a continuation/service-retry occurrence, or treat
historical ALS aggregates as current evidence.

The production/test manifest contains all 52 modified or untracked
`packages/**` files and no documentation or `AGENTS.md` path. Its 6,022-byte
canonical manifest has SHA-256
`3BB19A5103EBC5F5A4CB1ACEFEFE16933B3B2FF0661666A4E6C6D9851C73A026`.
The exact manifest algorithm and causal evidence are recorded in
[the Gate 20 implementation/evidence record](research/repa-gate-20-source-linked-future-attention-implementation-evidence-2026-08-07.md).

Focused current-fork evidence includes 15/15 Core FutureAttention cases,
12/12 Learning Context cases, 45/45 migration cases, all 54 enabled shared
LearningCommand runtime cases with 13 pre-existing skips at a proportionate
20-second timeout, two real released-v1 prompt traces, 86/86 registry/
presentation/direct-run/ACP/recovery cases, 15/15 TUI sync cases, event-manifest
checks, migration generation parity, SDK regeneration, and typechecks in Core,
Schema, OpenCode, TUI, and SDK packages. The positive prompt trace additionally
deletes the exact A1 service Session and proves that the concern remains served,
the service receipt reports `source_deleted`, a body-free Turn tombstone
remains, the Session row is gone, and the owner read contains no explanation
body. The negative A1/A2 trace proves one shared occurrence/address,
`not_served`, identical `already_applied`, changed `semantic_conflict`, one
terminal group, and an open concern until a genuinely new learner occurrence.

The retained reviewer returned `Revise` for this first implementation/evidence
candidate with `G20-IR-001..011` open. The findings cover phase-one rollback,
Gate 8 no-effect settlement, exact-target authority, learner-first lineage,
complete Tool source eligibility, live interruption and deletion recovery,
detached-carrier catch-up, stale-head presentation truth, temporal-expression
consistency, and the maximum-valid bound oracle. Contract/theory remains
accepted, no maintainer-owned blocker was exposed, and the recorded 52-file
manifest and green checks are superseded as acceptance evidence while the
top-level executor repairs the implementation.

### 2026-08-07 Gate 20 executor repair-closure candidate

The top-level executor accepted all eleven findings without reopening the
accepted contract. `G20-IR-001..005` are addressed by nested transactional
rollback for late domain validation, a receipt-free redundant-dismiss
`no_change`, root-current-learner-only `explicit_exact`, same-root-lineage
learner-first witnesses, and a program-owned
`learner_usable | internal_control` Tool-source classification with non-empty
complete output. `G20-IR-006..007` are addressed by an uninterruptible exact-A1
finalizer installed as prompt-operation cleanup and exact unavailable
model/tool/source tombstone observation after supported Session deletion.
`G20-IR-008..009` are addressed by a paged durable finalization owner endpoint,
history/live receipt-ID dedupe across TUI, direct interactive and
noninteractive run, attach/local-server, and ACP load/resume, plus one shared
truthful stale-head presenter. `G20-IR-010..011` are addressed by exact-offset
source-expression consistency and a domain-admitted maximum-valid Context
oracle using only safe integers and real source-unavailable projection.

The repair also changes V20's new Turn constraints to additive columns plus
versioned triggers rather than rebuilding referenced tables. Frozen V16/V17/
V18/V19 upgrades and staged V13→V14→V15→V16 constructors converge on the
current schema. The migration generator now invokes the pinned Drizzle CLI
with an 8,192 KiB Node stack because the unmodified default stack overflows on
the current generated schema; full generation and `--check` both complete.

The final repair production/test manifest contains every modified or untracked
`packages/**` path and excludes documentation and `AGENTS.md`. Its canonical
form is the ordinally sorted UTF-8/no-BOM sequence
`path<TAB>actual-byte-length<TAB>uppercase-SHA-256<LF>`, including the final LF.
It contains **68 files / 7,942 bytes** and has SHA-256
`4E2ED6F94F8D2DB602FCFD785BEA75578E3DA714F73627F6F7E160925EB6FC5D`.
The accepted contract remains
`0BE73ABB75D0957273FF5C5F986735491C1EEAF38072B9D7A82020073A318A7F`.

Fresh causal evidence includes Core FutureAttention **20/20 with 183
expectations**, Learning Context **12/12 with 40**, civil-time qualification
**3/3 with 33**, and the complete migration suite **45/45 with 424**. Focused
OpenCode evidence includes the three Gate 20 runtime cases (**28
expectations**), exact-A1 success plus live-interruption prompt cases (**35**),
the negative A1/A2 case (**14**), tool registration (**2/2, 7**), presentation/
hook/manifest cases (**5/5, 32**), the real server/ACP/noninteractive process/
direct-run/interactive-stream carrier group (**6/6, 29**), and ACP load/resume
catch-up (**2/2, 7**). TUI two-page history/live dedupe passed **1/1**, Schema
event manifest passed **2/2 with 28**, Core/Schema/OpenCode/TUI/SDK typechecks
passed, generated client/SDK parity passed, and `git diff --check` reported no
whitespace error.

The maximum real semantic value is **1,877 bytes**, leaving **171 bytes** under
Gate 18's 2,048-byte ceiling; without optional order it is 1,815 bytes. Measured
whole cuts are zero **6,394/6,160**, minimum **7,393/7,446**, maximum
**9,048/9,073**, and ten-eligible/eight-projected **14,763/14,855** canonical/
rendered bytes. One-byte-over purpose admission still fails.

At that first closure dispatch, the repair candidate remained subject to the
original retained reviewer. Those facts were executor closure evidence, not
reviewer closure: `G20-IR-001..011` remained open until task
`019fd773-84c3-7841-9fc5-45f1b18d4a9f` returned a new implementation/evidence
disposition under
`G20-WG-20260806-019fd69a-01`.

This remains uncommitted implementation/evidence work, not a Gate verdict.
The index remains empty; `HEAD` and `origin/main` remain at the implementation
base; the pre-existing maintainer-owned `AGENTS.md` change remains excluded;
and no credentialed provider, external durable action, Git integration, push,
release, Gate 21, or Gate 21A transition occurred. Retained independent reviewer
task `019fd773-84c3-7841-9fc5-45f1b18d4a9f` remains retained for closure under
`G20-WG-20260806-019fd69a-01` after causal repair evidence is complete.

### 2026-08-07 Gate 20 first closure review and second repair candidate

The retained reviewer returned implementation/evidence `Revise` again. It
independently closed `G20-IR-001..007`, `G20-IR-009`, and `G20-IR-011` without
reopening contract/theory, and kept two High findings open. `G20-IR-008` showed
that initial attach/load/resume paging did not repair a finalization committed
during a later TUI or ACP SSE gap; ACP also marked the receipt seen before either
client update was acknowledged. `G20-IR-010` showed that four-or-more fractional
digits could bypass exact parsing and that RFC-3339 `-00:00` was fabricated as a
known zero offset. No maintainer-owned blocker was exposed. The reviewer left
the production checkout, index, history, credentials, and external systems
unmodified; `HEAD` and `origin/main` remained at the implementation base.

The top-level executor accepted both findings. Every physical global-SSE
connection already emits `server.connected`; TUI and ACP now use that exact
epoch to request durable owner history for each retained exact Session/directory.
The global route registers its live listener before emitting the epoch. Per-key
owner reads are single-flight and generation-counted, so another reconnect or
load/resume request arriving in flight queues a fresh scan from `-1` rather than
being swallowed or run concurrently. ACP delivery records only the client-
acknowledged `pending` and `completed` phases; failure before either acknowledgement
leaves exactly the unfinished phase retryable under the same receipt identity.

The civil-time parser now recognizes lowercase `t/z` and arbitrary nonempty
fractional seconds, rejects nonzero precision beyond the integer-millisecond
domain, preserves zero-only extra precision, rejects unknown `-00:00`, validates
calendar/clock/offset bounds, and fails closed only for compact exact-looking
tokens. Full descriptive expressions are not scanned or silently promoted to an
exact source.

Fresh closure evidence includes the complete civil-time/FutureAttention/Goal
group (**40 passed / 262 expectations**), ACP event plus global HttpApi group
(**26 passed / 61 expectations**), complete TUI sync file (**16 passed / 60
expectations**), ACP load/resume wiring (**2 passed / 7 expectations**), and
Core/OpenCode/TUI typechecks. The decisive sub-oracles prove TUI and ACP
non-overlapping queued generations, exact retained-directory binding across an
active-directory change, multiple `server.connected` epochs inside one ACP
outer subscription, ACP first/second-phase failure retry, an event queued before
global response-body consumption, 13 pure parser cases, and 23 transactional
temporal assertions.

The second production/test manifest includes every modified or untracked
`packages/**` path and excludes documentation and `AGENTS.md`. Under the same
ordinal UTF-8/no-BOM
`path<TAB>actual-byte-length<TAB>uppercase-SHA-256<LF>` algorithm it contains
**71 files / 8,314 bytes** and has SHA-256
`29338349F95579E70119E726A5145D433E01AAC3F6D04618639C935F1221DC2A`.
The accepted contract remains byte-identical at
`0BE73ABB75D0957273FF5C5F986735491C1EEAF38072B9D7A82020073A318A7F`.

These repairs remain executor evidence. `G20-IR-008` and `G20-IR-010` stay open
until the same reviewer closes them and returns implementation/evidence
`Accept`; the other nine findings remain closed. The index is empty, the
pre-existing maintainer-owned `AGENTS.md` change remains excluded, and no
commit, push, release, credentialed call, Gate 21, or Gate 21A transition has
occurred.

### 2026-08-07 Gate 20 second closure review and third repair candidate

The retained reviewer closed `G20-IR-010` after independently checking the
arbitrary-fraction, lowercase-marker, exact-offset, `-00:00`, malformed-token,
and descriptive-expression boundary. Every earlier implementation finding
remained closed. It kept only `G20-IR-008` open and narrowed its original
missed-finalization impact to TUI reconnect failure recovery: a rejected owner
read was swallowed while the full-sync marker remained, so no retry occurred
unless an unrelated later reconnect or process restart happened. Contract/theory
remained accepted and no maintainer-owned blocker appeared. Review was read-only;
the exact 81-path checkout, 71-file package set, empty index, base, contract, and
excluded `AGENTS.md` hash remained stable throughout that pass.

The top-level executor retained the existing exact Session/directory,
generation, and single-flight boundary, and added one reconnect-recovery task per
key. A rejected read leaves its generation pending and retries after bounded
delay without requiring another SSE epoch; another epoch arriving in flight
still queues a fresh scan. The task stops after exact mapping deletion/rebind or
TUI-provider disposal, and Session deletion explicitly removes the mapping.

The new TUI regression emits one `server.connected`, rejects the first owner
read, invokes ordinary Session sync while its full marker still short-circuits,
and then observes the automatic retry publish the durable receipt. It proves two
exact-directory reads, maximum concurrency one, and one stored receipt without a
second connection epoch. The complete TUI sync file passes **17/17 tests with 65
expectations** and the TUI typecheck passes.

The third production/test manifest still contains **71 files / 8,314 canonical
bytes** under the recorded ordinal UTF-8/no-BOM algorithm, now with SHA-256
`1507DAF44F5B48A430C2491694C5A4547B9E9B2D5CF3D4D2E1A3190B995C6CB0`.
The accepted contract remains byte-identical at
`0BE73ABB75D0957273FF5C5F986735491C1EEAF38072B9D7A82020073A318A7F`.
This third repair remains executor evidence: only the retained reviewer can
close `G20-IR-008` and return implementation/evidence `Accept`. The index is
empty, the maintainer-owned `AGENTS.md` change remains excluded, and no Git
integration, credentialed call, release, Gate 21, or Gate 21A transition has
occurred.

### 2026-08-08 Gate 20 whole-Gate review acceptance

Retained reviewer task `019fd773-84c3-7841-9fc5-45f1b18d4a9f` returned final
**Accept** for the implementation/evidence layer under
`G20-WG-20260806-019fd69a-01`. It independently reproduced the exact TUI
reconnect-failure regression (**1 test / 5 expectations**), closed
`G20-IR-008`, and found no neighboring generation, single-flight,
exact-directory, deletion/rebind, provider-disposal, or evidence regression.
`G20-IR-001..011` are all closed; no new acceptance-changing finding, material
unknown, owner blocker, contract contradiction, or execution failure remains.

The reviewer independently reconstructed the accepted production/test
projection as **71 files / 8,314 canonical manifest bytes** with SHA-256
`1507DAF44F5B48A430C2491694C5A4547B9E9B2D5CF3D4D2E1A3190B995C6CB0`.
The accepted contract remained
`0BE73ABB75D0957273FF5C5F986735491C1EEAF38072B9D7A82020073A318A7F`;
the accepted implementation/evidence record before this status-only
reconciliation remained
`E86AA8B386CF613F0AF5E7CEE7D7844ED893944D0B36AE4D63450192FDE3DE00`.
Review left `HEAD` and `origin/main` at
`3317525aeb242dfcf3cec49c0dd627cd38ee8144`, the index empty, the 81-path
working tree unchanged, and excluded maintainer-owned `AGENTS.md` at
`540417B5B646A3232452004482237166D79A418E790DE7FF363F088B15BB5421`.

Gate 20's contract/theory and implementation/evidence review layers are both
accepted. This establishes readiness only for the separately governed local
integration step. The acceptance callback and this status reconciliation do
not authorize or perform staging, commit, merge, push, release, credentialed
provider use, Gate 21, or Gate 21A work.

### 2026-08-08 Gate 20 feature-branch integration

After separate maintainer publication authorization, exact commit
`1f92169840559b63eb8f96c31a67985c814a86f0` recorded the accepted 71-file
production/test projection together with its contract, evidence, architecture,
roadmap, and review records on branch `codex/gate-20-future-attention`. The
reviewer-accepted pre-integration raw working-tree projection was bound by
manifest `1507DAF44F5B48A430C2491694C5A4547B9E9B2D5CF3D4D2E1A3190B995C6CB0`.

This docs-only successor records that integration identity without altering the
accepted package projection. The pre-existing maintainer-owned `AGENTS.md`
change remains uncommitted and excluded. At this feature-branch cut, `main` had
not advanced; release, credentialed provider use, Gate 21, and Gate 21A remained
outside this integration record.

### 2026-08-08 Gate 20 mainline integration

The maintainer subsequently corrected the publication route: this private
maintainer-owned repository uses direct mainline integration rather than a pull
request as its governing path. Draft pull request `#1`, which had been opened
under the inapplicable external-collaboration assumption, was closed without
merging. Local `main` was fast-forwarded through feature-branch integration
commit `e1857d00d33d3e6829b1b3b49b5f87cfdcf882df` and this docs-only mainline
status successor. Direct publication to `origin/main` is authorized and
pending.

Reviewer acceptance bound the pre-integration raw working-tree projection at 71
files / 8,314 manifest bytes / SHA-256
`1507DAF44F5B48A430C2491694C5A4547B9E9B2D5CF3D4D2E1A3190B995C6CB0`.
System-owned `core.autocrlf=true` stored its LF-clean Git-tree projection at
implementation commit `1f92169840559b63eb8f96c31a67985c814a86f0`: 71 files
/ 8,314 manifest bytes / SHA-256
`1F185B1944A5B89AFE7A8FBBEEBE2B0165A86AB4D3C3BFF97BF562923AD5D3F6`.
A fresh checkout expands that tree to a CRLF working projection: 71 files /
8,314 manifest bytes / SHA-256
`CB5114543DB5419DD5C338D57CEE995FD8D65651843E5322CB1E82C6FDEA5032`.
All 71 files are valid UTF-8; every checkout/blob byte difference is CRLF versus
LF, CRLF-to-LF comparison yields zero content differences, and no lone CR
exists. These are distinct byte identities of one semantically unchanged source
projection; the former byte-identical wording is withdrawn. Retained reviewer
finding `G20-INT-001` classified the discrepancy as a Medium provenance/status
correction and did not reopen `G20-CR-001..010` or `G20-IR-001..011`.

The intervening successors change documentation only. The pre-existing
maintainer-owned `AGENTS.md` modification remains uncommitted and excluded. The
redundant feature-branch ref may remain as provenance; it does not own current
Gate status. No release, credentialed provider use, Gate 21, or Gate 21A action
follows.

### 2026-08-08 Gate 20 direct `origin/main` publication

After the event-truthful local integration/status record was committed at
`228126535619a70d172e17e6f6b56b27cf86fbb6`, direct publication succeeded:
`origin/main` fast-forwarded from
`3317525aeb242dfcf3cec49c0dd627cd38ee8144` through that commit. This docs-only
successor records the completed remote fact; it changes no package blob or Gate
20 acceptance boundary. Draft pull request `#1` remains closed without merge,
and no pull request participates in the integration identity.

The pre-existing maintainer-owned `AGENTS.md` modification remains local,
uncommitted, and excluded. The redundant remote feature branch remains only as
provenance. No release, credentialed provider use, Gate 21, or Gate 21A action
follows.

## 2026-08-08 Gate 21 experiment, Assignment split, and contract candidates

Current disposition remains owned only by `docs/README.md`. Derivation opened
from exact `HEAD = main = origin/main`
`c100b431fe174d1993b2baa89a7d1b133300b579`; Gate 20 implementation
`1f92169840559b63eb8f96c31a67985c814a86f0` and integration/status
`228126535619a70d172e17e6f6b56b27cf86fbb6` are ancestors. The pre-existing
maintainer-owned `AGENTS.md` collaboration-rule modification remains preserved;
the current documentation candidate also reconciles the settled-constraint
checksum without claiming ownership of that earlier edit.

The required Gate 21 pre-contract experiment is recorded in
`docs/research/repa-gate-21-cross-day-planning-boundary-experiment-2026-08-08.md`.
It used one objective-free integer time-expanded transportation/max-flow
feasibility kernel, an independent source-bearing allocation validator, and an
exhaustive dynamic-programming oracle over bounded fixtures. The experiment
established:

- the same exact OS and DS Goal revisions, with separate accepted Planning
  inputs of work 6 / deadline Aug 18 and work 8 / deadline Aug 20, are feasible
  with materially different slack and allocation shape from Aug 6 versus Aug
  16;
- per-demand feasibility is unsound when two proposals spend the same shared
  daily capacity;
- correcting Aug 17 capacity from 3 to 1 makes the late portfolio short by one;
- total capacity can exceed total work while an earlier local deadline remains
  infeasible;
- an exact Assignment revision and an exact Goal revision are interchangeable
  only as tagged Planning producers, never as identities/lifecycles;
- interval inputs can yield guaranteed-feasible, guaranteed-infeasible, or
  indeterminate truth without invented point estimates;
- silence/intermittent absence produces no activity fact or historical plan
  mutation; and
- divisible flow misclassifies one contiguous four-quantum block spread over
  two two-quantum days, preserving indivisibility/contiguity as the explicit
  algorithm-widening falsifier.

The experiment returned the split condition reserved by the 2026-07-21 Gate 16
planning correction. Assignment has independently valid obligation identity,
revision, source, lifecycle, Context/read behavior, migration, recovery, and
reopen conditions. Planning has independently valid accepted-input,
shared-capacity, feasibility, working-allocation, staleness, feedback,
recomputation, and exact-consumption behavior. A valid Assignment remains true
when Planning is unknown, infeasible, denied, interrupted, or failed; therefore
no all-or-none create-Assignment-and-plan invariant exists.

Roadmap 09 now inserts **Gate 20A — learning-relevant Assignment authority** and
retains **Gate 21 — substantial cross-day Planning authority** plus published
Gate 21A/22/23 numbering. Gate 20A is not a child of Gate 20 and does not make
every plan require an Assignment; Goal-driven Planning remains first-class.
The earlier Gate 16 provenance statement “No new numbered Gate is introduced
now” was correct before its reserved experiment ran and is now superseded by
this roadmap-owner result rather than rewritten as historical evidence.

The maintainer additionally corrected the product framing: Repa's purpose is
helping learning, not mechanically completing measurable tasks. The owner
documents therefore now make Assignment a source-relative **learning-relevant**
obligation with a real teaching, guided-work, review, or Planning consumer. Its
`completed` disposition only prevents closed pressure from contaminating later
learning decisions; it is not learning, mastery, submission, grade, activity,
or product success. Planning produces a correctable working allocation and
hard feasibility/trade-off facts, not a commitment, adherence ledger, or
task-closure objective. Intermittent/non-exclusive use, silence, and elapsed
allocations create no progress or non-progress inference.

The first reviewable successor is
`docs/research/repa-gate-20a-assignment-authority-2026-08-08.md`. Its current
status is contract/theory candidate only. It admits exact learner-report or
exact source-observation interpretation, generated Assignment identity,
immutable linear revisions, bounded obligation/learning context, optional
unresolved/no-deadline/date/instant due and separate expiry meaning, explicit
`open | completed | cancelled | dismissed | superseded` lifecycle, exact owner reads,
Gate 18 Context/lazy-read projection, root-Agent capability/permission,
Gate 8 settlement/recovery, and an exact immutable Planning handoff. It excludes
Tutor-issued obligations, self-promises, generic tasks/todos, Planning
arithmetic, inferred activity/progress, administrative obligation tracking,
external submission, and completion-as-product-success.

The separate Planning successor is
`docs/research/repa-gate-21-cross-day-planning-authority-2026-08-08.md`. It is
also a contract/theory candidate only. It admits one current LearnerHome
portfolio with exact Goal/Gate-20A Assignment producers, source-bearing point/
interval/unknown workload and shared-capacity inputs, an exact civil-time
horizon, staged immutable input/assessment/allocation revisions, program-owned
maximum-flow feasibility and independent portfolio validation, source-bearing
allocation proposals, failure-preserved correction/recomputation, qualified
unknown/unsupported truth, intermittent re-entry
without inferred activity, exact Context/lazy reads, and one narrow changed-
plan/changed-Tutor-move consumer. It rejects a solver tie as pedagogy, multiple
double-spending current plans, plan adherence/commitment, automatic progress,
task-closure optimization, unsupported contiguity, producer lifecycle mutation,
and a background planner runtime.

Gate 20A whole-Gate review run `G20A-WG-20260808-019fe065-01` uses fresh
top-level reviewer task `019fe134-5860-7ed3-a754-ca22c9689b18`. Its first
contract/theory pass returned `Revise` and left the production checkout
unchanged. It preserved the Assignment/Planning split but opened five High,
acceptance-blocking findings:

- `G20A-CR-001`: terminal-to-terminal correction required a knowingly false
  `open` revision;
- `G20A-CR-002`: a superseded head could not correct its own meaning while
  preserving, retargeting, or truthfully clearing its current exact relation;
- `G20A-CR-003`: admitted `agent_correction` had no semantic address after the
  learner/source change-set address settled;
- `G20A-CR-004`: automatic Assignment Context had no closed eligibility,
  cardinality, ordering, omission, or mandatory-fit contract; and
- `G20A-CR-005`: exact immutable Assignment source basis was conflated with
  current source-owner availability and lacked the consuming dependency cut.

The executor repair replaces false intermediate reopening with one truthful
final successor, makes supersession relation action explicit, gives only an
exact-head-anchored Agent correction an exact issuing-root-model-operation
address, closes all-current-open zero/sole/multiple Context cardinality and fit,
and separates immutable source/admission basis from owner-native current status
at each read/Context/Planning cut. Architecture projections, Roadmap 09, and the
provisional Gate 21 Assignment handoff are reconciled only where those findings
invalidate predecessor assumptions.

On the first repair-closure pass, the same reviewer accepted exact Gate 20A
contract/theory candidate SHA-256
`3E6BC18FB930EFB0BF22014C9E3C944DEABFB1119F6814BC4109D161829E3A7F`.
`G20A-CR-001..005` are closed; no new finding, owner blocker, or material unknown
remains. The reviewer independently inspected the corrected lifecycle,
supersession, Agent-correction address, Context cardinality/fit, and source-cut
semantics, treated executor oracles as supporting evidence rather than
authority, and left the checkout unchanged. This accepts only the
contract/theory layer. The maintainer's Whole-Gate authorization now permits one
executor to build Gate 20A; the same reviewer remains idle for its later
implementation/evidence review. Gate 21 remains an unreviewed candidate pending
that implementation closure and exact handoff reconciliation. Integration,
commit, push, release, credentialed provider use, and Gate 21A work remain
unstarted.

The retained reviewer's first Gate 20A implementation/evidence pass bound a
37-file / 4,094-byte package manifest at SHA-256
`AA3D2C030A872025C3BD0193BBD5463682385F9EEF2730DE34BD40276E1CC527`
and returned **Revise**. It opened `G20A-IR-001..009`: an unsealed no-change
semantic address; an unterminalizable pre-admitted source-address loser; learner
direction able to create replacement truth; non-learner source time borrowing
the issuing occurrence's zone; historical Representation reads joining later
owner state; Course withdrawal blocking correction; missing provider-visible
non-Assignment boundaries and negative traces; invalid civil dates passing the
database trigger; and a status map that falsely said the candidate did not
exist. The reviewer left the production checkout and Git state unchanged.

The executor's unstaged repair candidate now binds 41 package production/test
files, 4,521 canonical manifest bytes, SHA-256
`D00E8DB84C968A46E304A8F03FCFD1CC719EE2573BACE2CB9FA83D3D7D80078B`.
It gives no-change its own immutable semantic owner, closes both pre-admitted
race paths and recovery, restricts learner direction, binds source-relative time
to the effective source, makes old Representation reads/cursors typed-stale
without later payload, carries only existing exact Course scope after
withdrawal, exposes the semantic boundary to the ordinary Agent, validates real
civil dates, and reconciles current status. Focused package typechecks and
causal suites pass, including Core Assignment 26/26, the complete migration file
46/46, OpenCode Assignment runtime 10/10, presentation 15/15, registry 36/36,
and positive-plus-negative released-v1 prompt traces 2/2. These are executor
claims and supporting evidence only until retained-reviewer closure.

### 2026-08-09 Gate 20A whole-Gate review acceptance

The same retained reviewer returned final implementation/evidence **Accept**
for the exact 41-file / 4,521 canonical-manifest-byte package candidate at
SHA-256
`D00E8DB84C968A46E304A8F03FCFD1CC719EE2573BACE2CB9FA83D3D7D80078B`.
`G20A-IR-001..009` are all closed; no new or replacement finding, owner blocker,
material contract contradiction, or contract reopen condition remains. Gate
20A's contract/theory and implementation/evidence layers are therefore both
accepted under `G20A-WG-20260808-019fe065-01`.

The reviewer independently reran the repair-focused Core cases, the frozen
Gate-20-to-20A migration oracle, the real NTFS Representation drift/grant/
missing-Artifact cursor case, and the exact Artifact-drift case. These
verdict-changing checks corroborated the candidate-bound executor typechecks,
migration-generation check, complete Assignment and migration suites, OpenCode
runtime/presentation/registry tests, and positive-plus-negative released-v1
prompt traces. The earlier broad name-filtered OpenCode runtime stall remains a
disclosed, nonblocking Bun test-runner/layer-teardown or scheduling unknown for
later release qualification; no individual Assignment scenario reproduced it.

At acceptance callback, `HEAD`, `main`, and `origin/main` remained
`c100b431fe174d1993b2baa89a7d1b133300b579`, the index was empty, the exact
candidate manifest and verdict-bearing document hashes were unchanged, and the
reviewer had made no production, documentation, Git, release, credentialed, or
external durable-system mutation. This acceptance establishes readiness only
for the separately governed local integration step. It does not itself commit,
push, release, review Gate 21, or begin a later Gate; the reviewer remains
visible as durable Gate 20A evidence and is not reusable for another Gate.

## Historical evidence locators

### Pre-fork source audit

`docs/research/opencode-one-time-fork-audit-2026-07-13.md` at the oracle tag.

### Product behavior and dogfood traces

`docs/foundation/03-complete-learning-traces.md` and
`docs/roadmap/05-first-dogfood-tutor-loop.md` at the oracle tag.

### Experiment ledger

`docs/research/experiment-ledger.md` at the oracle tag. This is the locator for
historical ALS reports. The raw run artifacts behind reported aggregates are
not retained; the reports are unqualified provenance and cannot satisfy a
current Gate acceptance claim.

### Superseded decisions

`docs/decisions/0001-opencode-reference-strategy.md` and
`docs/decisions/0011-single-process-tutor-loop-over-mature-mechanics.md` at the
oracle tag.

### Conditional-purpose evidence

ADR-0013's experiment and result documents remain under `docs/research/` at the
oracle tag. Their tracked code and prose are historical design provenance, not
production modules or current acceptance evidence; the raw `.runs` required to
reproduce their aggregate claims are not retained.

### Identity-isolation evidence

The complete Gate 3 contract and verification record remains
`docs/research/opencode-fork-gate-03-repa-identity-isolation-2026-07-13.md`
at the oracle tag. The active roadmap records its passing commit.
