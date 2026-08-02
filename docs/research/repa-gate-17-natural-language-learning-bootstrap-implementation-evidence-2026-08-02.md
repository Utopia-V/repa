# Gate 17 natural-language learning bootstrap implementation/evidence candidate

Status: executor-produced implementation/evidence candidate, prepared on
2026-08-02. This record claims neither independent review acceptance nor
integration.

## Exact authority and candidate binding

- implementation base:
  `822f8a3df4baa5b51002e7ffd8118a01d567c2a0`;
- accepted contract:
  `cf0cfbd032273cf7360fe7747ef0809abda6181f`;
- implementation branch: `codex/gate17-implementation`;
- containing commit: the commit that contains this record, supplied exactly in
  the executor handoff because a commit cannot contain its own hash; and
- disposition: ready for coordinator inspection and fresh independent
  implementation/evidence review, not accepted, integrated, pushed, or
  authorized as Gate 18 input.

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
integrity, and the V17 trigger manifest. Recovery reads the durable Gate 17
disposition and capability history and settles admitted, waiting, or allowed
but uncommitted work without inventing an effect.

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
arm-specific authority identity. The one-operation arm forces the ordinary
permission prompt for that exact path and invocation even when the bootstrap
write itself is otherwise configured `allow`. The canonical command rejects a
second potentially mutating new local target and rejects transient `read`,
`search`, `attachment`, or `web` values as durable material adoption. Such
transient context can inform the ordinary Agent, but it creates no Artifact,
Map, alignment, or Course relation.

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

The versioned semantic-presentation schema carries the exact proposal scope and
terminal facts. Core projects only verified Course/View/Revision identity,
child outcomes, exact material targets and source authority, working selection,
anchor head/target/usability, stage truth, and the correction route. The
primary TUI, direct-run carrier, and ACP all consume that same typed basis. ACP
preserves raw output for protocol clients but fails closed instead of displaying
an unverified consequential result as committed truth.

## `G17-BS-001..008` evidence mapping

| Contract claim | Causally decisive implementation/evidence                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `G17-BS-001`   | Registry and collision tests show the ordinary default Agent receives the read/write tools while `learn` and `/learn` are absent. Runtime evidence starts from an ordinary user message and existing Agent ToolPart; there is no alternate entry or interpreter.                                                                                                                                                                |
| `G17-BS-002`   | Strict input normalization rejects caller-owned administrative facts and unknown/transient material types. Course/navigation and material query tests prove bounded exact reads and zero writes. The only write is the closed V1 `update_learning_course` payload.                                                                                                                                                              |
| `G17-BS-003`   | Owner-issued transaction seams and the composite settlement test prove all-or-none Course/View/Artifact/Map/alignment/selection/anchor settlement. Source mutation, an injected child-publication fault, and stale Course ownership roll every local child back. Separately committed Representation preparation remains visible after later bootstrap failure.                                                                 |
| `G17-BS-004`   | Course-only creation leaves zero Views. Successor revision, materially distinct View, split/merge mappings, Tutor-proposed unselected View, exact selection, authorship, and stale owner cases run through the Course owner tests and bootstrap tests.                                                                                                                                                                          |
| `G17-BS-005`   | The three Gate 10 arms each adopt exactly one local source with exact object/path provenance. Existing current and historical Artifact Revisions plus accepted Representation Revisions are referenced without fresh admission. A second potentially mutating target and transient read/search/attachment/web inputs are rejected; pure material reads leave every admission/current-use table and the frontier unchanged.      |
| `G17-BS-006`   | Preserve/set/clear selection and anchor cases, usable and absent anchor truth, route correction, and owner CAS are covered. Assertions keep default-Course, Goal, retained-steering, progress/mastery, and unrelated Session/project state unchanged.                                                                                                                                                                           |
| `G17-BS-007`   | Core and runtime evidence covers physical replay, semantic duplicate/conflict ordering, one semantic slot, exact root/delegated issuance, missing delegated membership, configured policy/prompt outcomes, permission correction/cancel/abort, CAS loss, commit seal, durable ToolPart, and recovery.                                                                                                                           |
| `G17-BS-008`   | Schema, presenter, TUI, direct-run, and ACP tests require one typed proposal/result basis and reject contradictory or missing consequential bindings. Applied, already-applied, no-change, staged partial, and error outcomes report only durable effects. The deterministic ordinary-Agent fixture proves same-Turn tool availability and settlement mechanics; provider language behavior remains separately qualified below. |

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
duplicate/conflict, exact one-operation prompting, source mutation, child
fault, stale owner snapshot, recovery, and no invented frontier/effect.

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

No paid provider call, credential use, or external write was authorized or
used. Therefore this executor does **not** claim the contract's bounded
released-v1 real-model language traces: fresh requests with and without local
material, create versus continue, same-route revision versus distinct View,
teach-only, transparent reversible choice, material ambiguity, same-Turn
teaching after each stage class, and pre/post-commit learner correction remain
for authorized independent qualification. The deterministic evidence does not
claim exhaustive language coverage, interpretation correctness, educational
efficacy, or Gate 23 product-loop closure.

## Fresh verification results

Environment: Windows, Bun `1.3.14` (`0d9b296a`). Commands were run from the
affected package, as required by repository guidance.

| Package / command                                                                                                                                                 | Exact result                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core: `bun test --timeout 30000 ./test/learning-bootstrap.test.ts ./test/database-migration.test.ts`                                                              | 49 passed, 0 failed, 476 assertions.                                                                                                                                                                                                                  |
| Core owner aggregate: Course, Artifact, ContentRoot, Representation authority/ownership/settlement, Material Map authority/ownership, and Gate 8 settlement files | 72 passed, 0 failed, 675 assertions.                                                                                                                                                                                                                  |
| OpenCode runtime: `bun test --timeout 30000 ./test/learning-command/runtime.test.ts -t bootstrap`                                                                 | 3 passed, 59 filtered, 0 failed, 20 assertions.                                                                                                                                                                                                       |
| OpenCode registry/presentation/ACP/direct-run affected files                                                                                                      | 74 passed, 0 failed, 322 assertions.                                                                                                                                                                                                                  |
| OpenCode historical Goal carry-forward regression                                                                                                                 | 1 passed, 61 filtered, 0 failed, 15 assertions after raising only its stale 15-second local budget to 30 seconds; behavior/assertions are unchanged.                                                                                                  |
| Schema: `bun test --timeout 30000 ./test/semantic-presentation-v1.test.ts`                                                                                        | 4 passed, 0 failed, 11 assertions.                                                                                                                                                                                                                    |
| TUI: `bun test --timeout 30000 ./test/util/semantic-presentation.test.ts`                                                                                         | 5 passed, 0 failed, 18 assertions.                                                                                                                                                                                                                    |
| Core: `bun run migration --check`                                                                                                                                 | Passed; incremental schema had no ungenerated change and the full current schema regenerated successfully in an isolated temporary directory.                                                                                                         |
| Core, Schema, OpenCode, and TUI: `bun run typecheck`                                                                                                              | All four package typechecks passed.                                                                                                                                                                                                                   |

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

## Review handoff

This is an executor self-review and does not satisfy independent acceptance.
A fresh reviewer must bind the containing commit, reproduce or otherwise
evaluate the causal evidence, inspect the exact diff against
`822f8a3df4baa5b51002e7ffd8118a01d567c2a0`, decide whether the external
released-model qualification is required before acceptance, and return an
explicit Gate 17 implementation/evidence disposition. No integration or Gate
18 work follows from this record alone.
