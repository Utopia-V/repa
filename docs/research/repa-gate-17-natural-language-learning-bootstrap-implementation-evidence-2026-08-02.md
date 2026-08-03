# Gate 17 natural-language learning bootstrap implementation/evidence record

Status: accepted and locally integrated. The executor candidate was prepared on
2026-08-02, extended through the authorized released-v1 real-model qualification
on 2026-08-03, and independently accepted at exact commit
`39a8c2f4f2ad7b2d920c33859258ab4c56d797fa` by original fresh reviewer task
`019fc311-9714-7eb3-a5f7-045ecf66a1a7`.

## Exact authority and candidate binding

- implementation base:
  `822f8a3df4baa5b51002e7ffd8118a01d567c2a0`;
- initial implementation/evidence candidate:
  `3c37f043ea50b855d9f752c50bb83249435488f2`;
- first local repair and original-reviewer closure base:
  `bd092577ae103e6a8d3049c65d6436ea6ecf956b`; the original reviewer closed
  `G17-IE-001`, `G17-IE-003`, and `G17-IE-004` there and retained only
  `G17-IE-002` from the local findings;
- bounded transition repair:
  `23a192c72489e3638a6eddeb6925a9efe6da381e`; the same original reviewer
  accepted exact closure of `G17-IE-002` there, leaving
  `G17-IE-001..004` closed;
- real-model qualification runtime candidate:
  `be6e78d14adb3d59f674320610ae305bd1502140`; it adds only internal
  post-admission learning-tool failure diagnostics after a qualification trace
  proved that the learner-safe `interrupted` settlement discarded the
  low-level cause;
- final implementation/evidence review disposition: **Accept**. The original
  fresh reviewer closed `G17-IE-005` on exact candidate `39a8c2f4` after
  independently checking the qualification archive, negative trace, database
  ordering/state, and diagnostic correction; `G17-IE-001..005` are closed;
- accepted contract:
  `cf0cfbd032273cf7360fe7747ef0809abda6181f`;
- implementation branch: `codex/gate17-implementation`;
- acceptance-bearing implementation/evidence commit:
  `39a8c2f4f2ad7b2d920c33859258ab4c56d797fa`; and
- disposition: accepted, fast-forward integrated locally without content drift,
  and not pushed. Gate 18 receives only its roadmap predecessor, not an
  implementation authority or a widened Gate 17 claim.

The candidate implements only the accepted Gate 17 bootstrap boundary. It does
not add a built-in `/learn`, a privileged learning envelope, a parser or
classifier, a preliminary selector, a second model call, a workflow runtime,
or a controller framework. The ordinary interactive Agent remains the only
baseline open-language entry, and choosing not to call the write tool remains
a legal zero-write teaching interaction.

## Implemented production boundary

### Versioned database and recovery authority

Migration
`20260802114557_gate17_learning_bootstrap` advances the native schema from the
frozen Gate 16 boundary to V17. Fresh installation and forward migration create
the same structural manifest, including the Gate 17 disposition, capability
issue and settlement, effect, child result, material-adoption, and commit-seal
relations. The migration installs versioned constraints rather than relying on
current helper code, and V17 replaces the affected route-anchor seal trigger so
the receipt is bound to the new invocation's exact Part.

The generated migration registry, generated schema, full `schema.json`, and
fresh-schema extras are checked in. The frozen Gate 16 upgrade test asserts
exact fresh-schema parity, an empty Gate 17 state after migration, foreign-key
integrity, and the V17 trigger manifest. Gate 16 did not persist the
ContentRoot object's last-write time or size. Migrated rows therefore store
`historical_v16_partial`, keep those two columns `NULL`, and expose an explicit
versioned owner-read projection whose `known` descriptor omits them and whose
`unknown` tuple names them. Fresh V17 writes remain `exact_v1` and the database
continues to require their exact last-write time and size. Recovery reads the
durable Gate 17 disposition and capability history and settles admitted,
waiting, or allowed but uncommitted work without inventing an effect.

### Owner-private local composition

The composite transaction does not write Course, Artifact, Material Map,
alignment, selection, or anchor owner tables directly. It uses the minimum
owner-issued seams needed by this one consumer:

- Course owns in-transaction Course create/correct, View create/revise, and
  exact working-selection application;
- ContentRoot owns race-safe prepared local reads and exact root-object/path
  revalidation for an approved ContentRoot, the active execution workspace, or
  a one-operation learner grant;
- Artifact owns prepared admission/observation mutation and exact historical
  Revision reference proof;
- Representation owns current-use proof for one exact accepted Revision;
- Material Map owns prepared Map publication, selector validation, and neutral
  alignment publication; and
- Learner Navigation owns route-anchor preparation, application, result
  projection, and sealing.

Standalone owner paths use the same invariants. Gate 17 adds no cross-domain
CRUD surface and no generic manager, service, repository, controller, command
bus, universal effect table, durable workflow, or background worker.

One `update_learning_course` invocation carries one versioned closed change
set for exactly one target Course. It may include one optional View change,
working-selection consequence, a bounded set of exact already-admitted
Artifact or Representation Revisions, at most one potentially mutating new
local Artifact target, Maps and neutral alignments over that set, and one exact
route-anchor consequence. All jointly knowable and authorizable local children
commit with the Gate 8 receipt and commit seal or roll back together.

External, long-running, separately authorized, or result-dependent work is not
folded into that transaction. A separately admitted Artifact or accepted
Representation remains independently committed if a later bootstrap loses a
Course race, and the bootstrap receipt reports the failure rather than
claiming the earlier stage was rolled back.

### Ordinary-Agent reads, write, and admission

The existing tool registry now exposes two Gate 17 surfaces through the normal
Agent harness:

- `learning_material_query` performs bounded, cursor-scoped, omission-truthful
  Artifact, Representation, Map, selector, and alignment owner reads without
  writing an observation, admission, current-use fact, command invocation, or
  frontier event; and
- `update_learning_course` accepts only the closed semantic intent above.
  Runtime code supplies IDs, versions, trusted time, occurrence/Turn/Part
  identity, root or delegated issuance, capability history, permission request
  identity, owner snapshots, frontier order, receipt, and seal.

The default Agent receives both capabilities. Restricted and delegated Agents
receive only the intersection of their current catalog and explicit authority;
omission remains deny. Built-in identifiers reject custom, plugin, and MCP
collision. Neither `learn` nor `/learn` is registered.

The local path preserves Gate 10's complete union. All three arms produce an
exact NTFS root-object descriptor, relative path, canonical target path, and
arm-specific authority identity for current V17 observations. The
one-operation arm is derived once from the same typed normalized command used
for the proposal, forces the ordinary permission prompt for that exact path
and invocation even when the bootstrap write itself is otherwise configured
`allow`, and supplies no durable `always` pattern. TUI and direct-run therefore
remain once-only, while ACP offers only **Allow once** and **Reject** for this
request. The canonical command rejects a second potentially mutating new local
target and rejects transient `read`, `search`, `attachment`, or `web` values as
durable material adoption. Such transient context can inform the ordinary
Agent, but it creates no Artifact, Map, alignment, or Course relation.

### Gate 8 ordering and truthful terminal carriers

Gate 17 consumes the existing physical learning-command invocation and adds
one `learning_bootstrap` semantic slot. Physical Part/call replay is resolved
first. A distinct physical invocation then resolves committed same-occurrence
semantics before capability evaluation: an exact duplicate returns
`already_applied`, while different meaning returns `semantic_conflict`.
Candidate settlement preserves root/delegated Agent issuance, default-deny
capability membership, configured allow/ask/deny behavior, permission
correction and cancellation, owner CAS, commit seal, terminal ToolPart, and
startup recovery.

The versioned semantic-presentation schema carries the complete normalized
bounded command as its typed proposal scope rather than a summary plus raw JSON.
Course intent, route identity, every route item and mapping, selection target,
material identity/read authority, every Map node/selector/coordinate,
alignment endpoint and reason, and anchor target are independently visible.
Core recomputes the command fingerprint from this scope and rejects malformed,
contradictory, or semantically changed metadata. It projects only verified
Course/View/Revision identity, child outcomes, exact material targets and source
authority, working selection, anchor head/target/usability, stage truth, and the
correction route. The primary TUI, direct-run carrier, and ACP all consume that
same typed basis; ACP sends a bounded human-readable projection and fails closed
instead of dumping or trusting unverified consequential metadata.

## `G17-BS-001..008` evidence mapping

| Contract claim | Causally decisive implementation/evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `G17-BS-001`   | Registry and collision tests show the ordinary default Agent receives the read/write tools while `learn` and `/learn` are absent. Runtime evidence starts from an ordinary user message and existing Agent ToolPart; there is no alternate entry or interpreter.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `G17-BS-002`   | Strict input normalization rejects caller-owned administrative facts and unknown/transient material types. Course/navigation and material query tests prove bounded exact reads and zero writes. The only write is the closed V1 `update_learning_course` payload.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `G17-BS-003`   | Owner-issued transaction seams and the composite settlement tests prove all-or-none Course/View/Artifact/Map/alignment/selection/anchor settlement. A table-driven production-runtime matrix injects faults at Course, route, selection, Artifact, Material Map, alignment, anchor transition, physical receipt, bootstrap effect, bootstrap seal, anchor seal, and physical invocation settlement. Every case proves exact rollback and frontier preservation, then startup recovery to one durable failed ToolPart with no effect or seal. Source mutation and stale Course ownership remain separately covered; independently committed Representation preparation remains visible after later bootstrap failure. |
| `G17-BS-004`   | Course-only creation leaves zero Views. Successor revision, materially distinct View, split/merge mappings, Tutor-proposed unselected View, exact selection, authorship, and stale owner cases run through the Course owner tests and bootstrap tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `G17-BS-005`   | The three Gate 10 arms each adopt exactly one local source with exact object/path provenance. Existing current and historical Artifact Revisions plus accepted Representation Revisions are referenced without fresh admission. A second potentially mutating target and transient read/search/attachment/web inputs are rejected; pure material reads leave every admission/current-use table and the frontier unchanged.                                                                                                                                                                                                                                                                                           |
| `G17-BS-006`   | Preserve/set/clear selection and anchor cases, usable and absent anchor truth, route correction, and owner CAS are covered. Assertions keep default-Course, Goal, retained-steering, progress/mastery, and unrelated Session/project state unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `G17-BS-007`   | Core and runtime evidence covers physical replay, semantic duplicate/conflict ordering, one semantic slot, exact root/delegated issuance, missing delegated membership, configured policy/prompt outcomes, permission correction/cancel/abort, CAS loss, commit seal, durable ToolPart, and recovery. The child-boundary matrix proves that every injected local failure leaves the invocation admitted and the Part pending until startup recovery durably closes it as interrupted; repeated recovery is exact and effect-free.                                                                                                                                                                                    |
| `G17-BS-008`   | Schema, presenter, an actual Permission-produced request, TUI, direct-run, and ACP tests require one complete typed proposal/result basis and reject contradictory, malformed, semantically changed, or missing consequential bindings. The one-operation case proves `permissionPromptRequired`, exact-reply lifetime, no `Always` choice, and a valid allow-once path on all three carriers. Applied, already-applied, no-change, staged partial, and error outcomes report only durable effects. The deterministic ordinary-Agent fixture proves same-Turn tool availability and settlement mechanics; provider language behavior remains separately qualified below.                                             |

## Closing-evidence groups

### 1. Deterministic authority and migration

Fresh Core evidence covers canonical bounds, generated/admin-field rejection,
one target Course, Course-without-View, frozen Gate 16 forward migration, fresh
V17 parity, empty-state non-fabrication, versioned constraints, foreign keys,
and reopening/recovery. The owner suite separately exercises identity,
revision, correction, availability, exact retry, cursor, CAS, atomicity, and
ownership-import constraints for Course, Artifact, ContentRoot,
Representation, Material Map, alignment, and Gate 8 settlement.

### 2. Read, capability, and semantic settlement

Registry evidence covers built-in collision, absence of `/learn`, catalog
intersection for default/restricted/delegated Agents, omission as deny, strict
payloads, bounded Course/material reads, cursor and omission truth, and zero
writes. Runtime/Core evidence covers root/delegated/missing capability,
allow/ask/deny, correction, cancellation, physical replay, semantic
duplicate/conflict, exact one-operation prompting without durable `always`
authority, source mutation, the complete local child/receipt/effect/seal/
physical-settlement fault matrix, live prompt abort, stale owner snapshot,
restart, repeat recovery, and no invented frontier/effect.

### 3. Course, material, navigation, and composition

The seven focused Core bootstrap cases cover Course-only creation, unchanged
composition, Course correction, successor and distinct Views, split/merge
mapping, Tutor-proposed unselected route, exact selection, route-anchor
preserve/set/clear and usability, every Gate 10 local arm, exact current and
historical Artifact Revisions, accepted Representation Revision, same-path new
bytes, Map and neutral alignment, the one-new-Artifact ceiling, rollback, and
truthful separately staged work. The owner aggregate supplies the deeper
withdrawal, correction, source drift, map/alignment ABA, and publication-boundary
oracles without moving those invariants into Gate 17.

### 4. Product-path qualification and explicit external remainder

The deterministic harness uses a normal learner User message, ordinary root or
delegated Agent issuance, the production tool registry, production learning
command runtime, durable ToolPart, and the shared TUI/direct-run/ACP typed
projection. It proves that the released-v1 execution path can expose and settle
the exact reads/write without `/learn`, an internal-ID management turn, a
special parser, or a second model call.

The maintainer then authorized the minimum released-v1 provider trace set using
only the already configured local provider. Final clean evidence binds exact
candidate `be6e78d14adb3d59f674320610ae305bd1502140`, runtime identity
`latest` / `1.17.18`, the default HTTP production path, and
`openai/gpt-5.5`. Seven ordinary learner Turns across five isolated Sessions
all completed normally with no assistant error: corrected fresh creation and
same-Turn teaching; post-commit same-route successor correction; a distinct
reversible unselected View; necessary clarification before an ambiguous
material write; exact teach-only continuation; one-operation material adoption
after **Allow once**; and rejection with truthful continued teaching.

The five write invocations settled as four `applied` and one
`permission_rejected`. Every applied result has one exact receipt, effect, and
seal; the rejected request has none. The two one-operation prompts preserve an
empty `always` set, exact-reply lifetime, valid typed TUI meaning, and ACP
choices exactly **Allow once** and **Reject**. Independent database checks show
seven completed Turns, 25 completed model operations, no running tool, two
Courses, two Views, three View revisions, and zero foreign-key violations.
TUI, direct-run, and ACP projections agree for all five command results.

The secret-free archive and its decisive negative predecessor are recorded in
`C:\Users\Discordance\.codex\campaigns\repa-gate17\evidence\reports\repa-g17-ie005-codex-recovery.md`.
The final 519,495-byte evidence JSON hashes to
`16bf2cc1f4ec23ceb16544418607659a2643c38eafe596a40efd07856dfba089`;
its 4,063,232-byte trace database hashes to
`cf7bd173e066ad87b0b704a037d1904f0e7aa1083ec2da71f9911043c8f9f030`.
The qualification does not claim exhaustive language coverage, interpretation
correctness, educational efficacy, or Gate 23 product-loop closure.

## Fresh review repairs and qualification results

The original fresh reviewer closed `G17-IE-001`, `G17-IE-003`, and
`G17-IE-004` on exact candidate `bd092577`, then accepted exact closure of
`G17-IE-002` on direct descendant `23a192c7`. Qualification candidate
`be6e78d14` preserves those boundaries and adds only internal failure logging
before the existing exact `interrupted` settlement. The same original reviewer
subsequently accepted the final qualification/evidence commit and closed
`G17-IE-005`; all five rows below are closed.

| Finding      | Repair and decisive evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `G17-IE-001` | One typed scope derives the exact one-operation path, `requirePrompt: true`, empty `always`, and `once_only` approval. A real `Permission.Service.ask` request carries `permissionPromptRequired` and `permissionExactReply`; TUI, direct-run, and ACP consume that exact request, ACP exposes **Allow once** plus **Reject**, and a tampered request becomes reject-only.                                                                                                                                                                                  |
| `G17-IE-002` | The shared typed scope now gives each mapping's source and target member arrays and the mapping-group array the Course owner's finite 1024-transition bound while retaining the Gate 17 command's separate 500-target-item limit and every existing owner/command check. Collision-free 500→1, 501→1, and 1024→1 merges pass `CourseRevision.prepare`, canonicalization, schema decoding, and one actual `Permission.Service.ask` request each; TUI, direct-run, and ACP consume the same exact complete mapping fact and expose only **Allow once** plus **Reject**. The schema accepts exactly 1024 members/groups and rejects 1025, `CourseRevision.prepare` rejects both a 1025-item revision and 1025 mapping groups at the owning boundary, and a fabricated owner-over-bound request is invalid/reject-only on all three carriers. The earlier complete-command, fingerprint-mismatch, and distinct-title evidence remains passing. |
| `G17-IE-003` | V16 migration no longer copies `initial_change_time` into last-write time or invents size zero. The frozen V16 fixture migrates to `historical_v16_partial` with both values `NULL`; a real Material Map owner read exposes only proven descriptor fields and the explicit `unknown: ["lastWriteTime", "size"]` tuple. Fresh V17 exactness remains enforced.                                                                                                                                                                                                |
| `G17-IE-004` | The production runtime fault matrix injects a database abort at Course, route, selection, Artifact, Material Map, alignment, anchor, receipt, effect, bootstrap seal, anchor seal, and physical settlement. Each boundary proves transaction and frontier rollback, no receipt/effect/seal, unchanged pending Part before restart, durable interrupted ToolPart after startup recovery, exact repeat recovery, and no late child effect; a full-command live permission abort independently proves prompted-abort settlement without entering the children. |
| `G17-IE-005` | The final clean released-v1 trace covers the seven representative language/product cases above on exact candidate `be6e78d14`, including same-Turn teaching, correction, reversible distinct-View choice, clarification before ambiguous write, exact teach-only continuation, once-only local material adoption, rejection, and carrier equivalence. An earlier interrupted tool left no partial effect but exposed that its internal exception was lost; `be6e78d14` logs that cause without changing settlement, and focused processor/typecheck evidence passes. |

`G17-IE-005` is independently closed. No credential file or value was manually
inspected, printed, copied, modified, or newly configured; the ordinary provider
path consumed the already configured local OAuth authority. The only external
writes were the explicitly authorized model requests; no push, publish, or
deploy occurred.

Environment for the repair checks: Windows, Bun `1.3.14` (`0d9b296a`). Each
command ran from the named affected package. The Schema and Gate 17 Permission
rows plus the Schema/OpenCode typechecks were rerun on this descendant; the
other rows retain unchanged `bd092577` closure evidence for the three findings
that this repair does not reopen.

| Package / exact command                                                                                   | Exact result                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema: `bun test test/semantic-presentation-v1.test.ts`                                                  | 5 passed, 0 failed, 17 assertions, including exact 1024 member/group admission and first-over-bound rejection.                                 |
| Schema: `bun run typecheck`                                                                               | Passed.                                                                                                                                         |
| Core: `bun test test/database-migration.test.ts --test-name-pattern "upgrades a frozen Gate 16 database"` | 1 passed, 41 filtered, 0 failed, 13 assertions.                                                                                                 |
| Core: `bun test test/learning-bootstrap.test.ts`                                                          | 7 passed, 0 failed, 96 assertions.                                                                                                              |
| Core: `bun run migration --check`                                                                         | Passed; the incremental projection had no ungenerated schema change and the full current schema regenerated in an isolated temporary directory. |
| Core: `bun run typecheck`                                                                                 | Passed.                                                                                                                                         |
| OpenCode: `bun test test/permission/next.test.ts --test-name-pattern "Gate17"`                            | 2 passed, 97 filtered, 0 failed, 79 assertions; actual Permission-produced 500/501/1024 requests cross TUI, direct-run, and ACP.                 |
| OpenCode: `bun test test/learning-command/presentation.test.ts`                                           | 8 passed, 0 failed, 66 assertions.                                                                                                              |
| OpenCode: `bun test test/acp/permission.test.ts`                                                          | 11 passed, 0 failed, 14 assertions.                                                                                                             |
| OpenCode: `bun test test/learning-command/runtime.test.ts --test-name-pattern "bootstrap"`                | 4 passed, 59 filtered, 0 failed, 159 assertions, including 139 assertions in the twelve-boundary fault/restart plus live-abort case.            |
| OpenCode: `bun run typecheck`                                                                             | Passed.                                                                                                                                         |
| TUI: `bun test test/util/semantic-presentation.test.ts`                                                   | 5 passed, 0 failed, 18 assertions.                                                                                                              |
| TUI: `bun run typecheck`                                                                                  | Passed.                                                                                                                                         |

These are focused causal checks, not a release-wide suite. This descendant's
fresh check directly crosses the Course revision owner, typed schema, actual
Permission request, TUI, direct-run, and ACP boundary and runs the two affected
package typechecks. The unchanged migration, transaction/recovery, and result
presentation rows remain bound to `bd092577`; rerunning them would not falsify
this isolated array-bound repair or change the status of already-closed
`G17-IE-001`, `G17-IE-003`, or `G17-IE-004`.

The qualification-discovered diagnostics correction was then checked from
`packages/opencode`: `bun run typecheck` passed, and
`bun test test/session/processor-effect.test.ts --test-name-pattern "settle an admitted learning tool failure as interrupted"`
passed 1 test with 4 assertions (29 filtered). Two subsequent instrumented full
traces and the final clean trace completed without a tool failure. Only the
final clean archive is used as positive acceptance-bearing evidence; the first
interrupted trace remains archived as negative evidence rather than being
discarded.

## Initial candidate verification results (retained provenance)

Environment: Windows, Bun `1.3.14` (`0d9b296a`). Commands were run from the
affected package, as required by repository guidance.

| Package / command                                                                                                                                                 | Exact result                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core: `bun test --timeout 30000 ./test/learning-bootstrap.test.ts ./test/database-migration.test.ts`                                                              | 49 passed, 0 failed, 476 assertions.                                                                                                                 |
| Core owner aggregate: Course, Artifact, ContentRoot, Representation authority/ownership/settlement, Material Map authority/ownership, and Gate 8 settlement files | 72 passed, 0 failed, 675 assertions.                                                                                                                 |
| OpenCode runtime: `bun test --timeout 30000 ./test/learning-command/runtime.test.ts -t bootstrap`                                                                 | 3 passed, 59 filtered, 0 failed, 20 assertions.                                                                                                      |
| OpenCode registry/presentation/ACP/direct-run affected files                                                                                                      | 74 passed, 0 failed, 322 assertions.                                                                                                                 |
| OpenCode historical Goal carry-forward regression                                                                                                                 | 1 passed, 61 filtered, 0 failed, 15 assertions after raising only its stale 15-second local budget to 30 seconds; behavior/assertions are unchanged. |
| Schema: `bun test --timeout 30000 ./test/semantic-presentation-v1.test.ts`                                                                                        | 4 passed, 0 failed, 11 assertions.                                                                                                                   |
| TUI: `bun test --timeout 30000 ./test/util/semantic-presentation.test.ts`                                                                                         | 5 passed, 0 failed, 18 assertions.                                                                                                                   |
| Core: `bun run migration --check`                                                                                                                                 | Passed; incremental schema had no ungenerated change and the full current schema regenerated successfully in an isolated temporary directory.        |
| Core, Schema, OpenCode, and TUI: `bun run typecheck`                                                                                                              | All four package typechecks passed.                                                                                                                  |

During verification, an intentionally broad five-file OpenCode aggregate first
reported 122 passes, 13 intentional historical-V1 skips, and one timeout in the
historical Goal carry-forward test. The exact test reproduced alone at about
16.2 seconds, establishing a stale test-local budget rather than a Gate 17
semantic failure; after the 15-to-30-second budget correction it passed in
about 19.9 seconds with all 15 assertions. An initial owner aggregate likewise
exposed a clock-sensitive deletion fixture and Gate 13's obsolete pre-Gate-17
import allowlist; the final 72/675 aggregate above passed after making the time
independent of suite latency and admitting only the exact read/runtime owner
API consumers while continuing to reject private table/SQL access.

## Independent review closure

Original fresh reviewer task `019fc311-9714-7eb3-a5f7-045ecf66a1a7` returned
explicit **Accept** for exact candidate
`39a8c2f4f2ad7b2d920c33859258ab4c56d797fa`, closed `G17-IE-005`, and accepted
the complete Gate 17 implementation/evidence candidate for local integration.
It independently matched the final archive hashes; queried the raw positive and
negative databases; confirmed pre-commit and post-commit correction, same-Turn
settlement-before-teaching order, exact receipts/effects/seals, once-only
permission shapes, material-byte identity, carrier agreement, and absence of
partial mutation after the interrupted invocation; and freshly reproduced the
focused diagnostic failure oracle. It found no descendant evidence that
reopened `G17-IE-001..004`.

The accepted qualification remains representative rather than exhaustive. It
does not claim complete language interpretation, pedagogical efficacy,
reliability qualification, release readiness, or Gate 23 product-loop closure.
The accepted candidate was fast-forward integrated locally at `39a8c2f4`
without content drift and was not pushed.
