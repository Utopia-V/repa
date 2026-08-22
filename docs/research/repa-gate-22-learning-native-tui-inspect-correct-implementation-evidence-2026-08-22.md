# Gate 22 learning-native TUI inspect/correct — accepted implementation/evidence

**Status: accepted by the retained independent Whole-Gate reviewer at exact package manifest `57A15F358CF9C1AF8FA8F79A956D8DD8769A1DF69957AB1F611DE998F418F3BB`; not integrated, staged, committed, published, or released**

This record binds the current Gate 22 implementation candidate to the already
accepted contract/theory result in
[the Gate 22 contract](./repa-gate-22-learning-native-tui-inspect-correct-2026-08-13.md).
It records the accepted implementation/evidence boundary and review
provenance; it is not a replacement product or architecture authority.

## Candidate identity

- base and current `HEAD`: `b8100d1c17cd31ec713062c8a1ca5254208899ec`;
- accepted prerequisite package predecessor: 90 paths / 5,424,504 bytes /
  manifest `334CDCAEEA573A8257E8F3B67A8A4AE9550F06522B3E85645B974CE126C4CBE6`;
- first implementation-review predecessor: 115 paths / 6,548,841 bytes /
  manifest `599DE4B866D513D2B6548C89D881E604A97F7C6C59824E25ABA1958899B5A3BB`;
- first-review repair predecessor: 131 paths / 7,049,375 bytes / manifest
  `E075C11974FB8822D311F1917CF20031FBBB3AF22AAFB3476B6C4A7DFD976535`;
- second-review repair predecessor: 132 paths / 7,097,071 bytes / manifest
  `9A9F3822CB1E9534D9C9B4BE1CAB631501F465EDA4C29BBCA0A0FD08A8287674`;
- third-review repair predecessor: 134 paths / 7,315,647 bytes / manifest
  `605A1167F1E591AA430AF3C16C1B93079CEFE2CA2C4FA76552992D976B42541D`;
- current fourth-review repair candidate: 134 paths / 7,338,855 bytes /
  manifest `57A15F358CF9C1AF8FA8F79A956D8DD8769A1DF69957AB1F611DE998F418F3BB`;
- working-tree status with untracked leaf files expanded: 149 entries / 49
  untracked / zero staged; no commit, integration, push, publication, release,
  or Gate 23 action is included.

The package manifest covers every modified or untracked regular file under
`packages/` from `git status --porcelain=v1 --untracked-files=all`. Records are
sorted by repository path and encoded as UTF-8
`path<TAB>byte-length<TAB>UPPERCASE-file-SHA-256`, joined by LF with no terminal
LF; the manifest is the uppercase SHA-256 of those bytes. It includes the
accepted prerequisite implementation because the checkout remains deliberately
unintegrated.

The first review dispatch reported package digest
`B9FACFDA36BA6D310CA4EB53F7909EC6E82869305184AE87CB9F001C3B5455FE` and
status 127 / 38 / zero staged. This was an identity-calculation ambiguity, not
package drift. The old digest is exactly reproducible from the same 115 file
paths, byte lengths, and file hashes by using NUL field separators, lowercase
file hashes, and a terminal LF. The shorter status used Git's default collapsed
untracked-directory presentation: `packages/core/src/session-deletion/` and
`packages/core/src/session-presentation/` counted as two entries instead of
their five regular files (`session-deletion/{integrity,schema,sql}.ts` and
`session-presentation/{schema,sql}.ts`), accounting for the three-entry
difference. The canonical format and expanded status above remove both
ambiguities.

## Implemented boundary

### Same-snapshot owner inspection

The registered Gate 18 owner reads remain the only `exact_read` producers.
Supported owner actions accept `includeInspection=true` or a bounded
`{ limit, cursor, deletionRootSessionID? }` request. A deletion root may be
supplied only after exact program resolution. The owner read and supplemental
Core inspection projection execute in one outer SQLite transaction. Tool
cancellation and the five-second deadline are observed outside and between
the bounded SQLite statements; the implementation does not claim that a
synchronous SQLite call can be interrupted halfway through. The result
retains the original action-specific `repaLineage` value; displayed inspection
metadata is explicitly fenced from that producer input. Goal projection now
recognizes the real nested `head.id` revision shape used by production reads.

The shared projection records:

- exact LearnerHome, Turn, Input, current Tool Part, action, frontier, and
  record/revision identities;
- the closed non-isomorphic owner arm, actual owner relation, source/epistemic
  facts, potential consumer scope, and owner-native correction route;
- one finite live-snapshot scope, complete terminal/Context coverage validation,
  section-level complete/truncated/locator-only/withheld/unsupported Context
  coverage and only then `complete_negative`; pending, unsealed, over-budget,
  continuation, and integrity cases remain gaps;
- exact Context classification, registered read, typed citation, and the
  specific model operation. A learner-visible action requires the terminal
  Turn's final operation plus a committed, eligible nonempty Assistant or
  `learner_usable` Tool presentation; a later terminal Turn cannot relabel an
  earlier Tool-only operation complete;
- FutureAttention conditional-purpose binding only when the exact historical
  owner snapshot at the Context frontier supplies current transition/version,
  source, target, scope, selection basis, and control interval; physical
  receipt, invocation, semantic effect, claim group, exact finalization member
  result/reason, and current concern disposition remain independent. If a
  durable finalization exists but its exact member or current concern projection
  cannot be validated, the entire dependent lineage section and top-level
  result become `integrity_validation_unavailable`; absence is never fabricated;
- root-only Session deletion state, separately seal-validated minimal audit,
  and bounded administrative-history classification/membership/frontier. A raw
  audit miss is `unknown`; `not_found` requires an exact root plus a bounded,
  completely validated minimal-audit bundle. Every root-bound result and signed
  continuation carries the exact root, bundle, deletion time, and predecessor
  Tool Part. Continuation is accepted only when the exact cursor bytes survive
  in that completed predecessor's typed inspection projection; the public
  checksum detects corruption but is not cursor authority. A caller-recomputed
  same-scope high operation position or a cursor from another deletion scope
  therefore conflicts before lookup;
- explicit non-causality: operational lineage never proves that one record
  caused a Tutor answer; and
- a pre-settlement observation cut that excludes the current inspection's own
  later exact-read, Tool settlement, Assistant presentation, and terminal Turn.

Owner-arm/owner-kind/record-kind mappings, meaning, potential effects, and
correction route are now decoded against one closed Core matrix rather than
independent strings. Nested purpose/action/finalization, deletion scope, and
administrative-history members are also closed shapes rather than unchecked
objects. Lineage and deletion-audit records must belong to the exact owner
record set; Session-deletion and administrative-history field combinations and
Session identity must agree with their typed status. In particular,
Course revision and working selection remain separate; navigation is an
independent learner owner; Representation and Material Map have no invented
generic head; Goal and Assignment remain peers; advice/judgment/evidence keep
  their epistemic limits; Interaction correction remains separate from Session
  deletion; and Context remains immutable. The production Interaction Tool now
  exposes the current operation's Context cut, its retained-steering cut, and a
  typed unsupported result for general retained-steering history.

### Producer-owned bounded reads and migration

Two versioned migrations add only rebuildable projection/index state:

- exact record/revision-first live Context and read/citation access;
- a producer-owned Context projection coverage seal, including migration
  backfill for existing canonical cuts through a frozen v1 decoder rather than
  the mutable runtime projector;
- terminal-root keyset indexes for live and retained unavailable Turn rows.

Live reverse reads validate every included operation's Context coverage and all
terminal operation seals. Minimal-audit reads inspect root/control state and
producer counts before any full-bundle load, and administrative-history reads
accept only bounded producer seals. Locator materialization now has one
producer pass: each query consumes the remaining row allowance and stops at the
first over-bound row; there is no second whole-Turn reconstruction. Exact range
reads validate Turn/source identity and read only the requested canonical
Message/Part page plus the complete intersecting eight-item integrity chunks.
Every current locator carries contiguous chunk fingerprints, so a changed body
in a partial middle page is stale without rescanning the whole Turn. Legacy
immutable Context locators remain readable as historical locator truth but do
not satisfy the new exact-range input schema. Range SQL is driven from an exact
`turn_input` / `turn_model_operation` membership CTE and primary-key joins; it
never scans the Session Message/Part indexes and filters unrelated rows through
correlated subqueries. Because Bun SQLite does not expose stable physical
statement row counters, the result reports a conservative
`databaseRowsUpperBound` with basis `exact_turn_membership_v1`, not a fabricated
exact visit count. The scale oracle executes an offset-250 one-item read over a
261-Part Turn after adding 500 unrelated rows to the same Session; its bound is
unchanged at 1,086. Visible results also report bytes decoded, while locators
above the admitted 512-row ceiling are refused before range work. Production
query builders are shared with `EXPLAIN QUERY PLAN` evidence against the fully
migrated schema; the plan contains no Session outer scan or correlated
subquery. Output `LIMIT` alone is not the oracle. Page
cursors are exact-record-set and section bound; each later page is a fresh cut
and never upgrades a cross-page miss to a global negative.

### Natural Interaction discovery and exhaustion

`learning_interaction_read` now exposes:

- thin keyset terminal-root pages that include the current Session and read no
  Message/Part body;
- separately bounded exact-locator materialization with first-over-bound
  `interaction_locator_over_budget`;
- explicit oversized-candidate skip with a permanent rolling gap;
- exact-range pages whose first offset is zero and whose continuation offset is
  the verified predecessor's exact `nextOffset`; an explicit forward jump adds
  a permanent authenticated range gap; and
- predecessor-linked continuation into a later learner Turn.

The fixed-size continuation binds query, last key, cumulative complete/gap
state, exact Session/Turn/Input/Part, model/tool ordinals, parent output, and a
canonical immutable search-output fingerprint. Continuation loads and verifies
the exact stored completed Part/candidate/invocation. Caller-recomputed gap
erasure, a surviving wrong predecessor/query/scope, changed output, arbitrary
beyond-end offset, rewind, directory page-one reset, and predecessor-free
range-zero reset after a same-Turn gap fail before a read. If
no predecessor Part survives, the caller token cannot prove deletion or prior
existence; the result is `cursor_source_unavailable_or_unresolved`, with no new
tombstone.

The current Turn's existing model/tool counts remain the cumulative budget.
The last successful call proactively reports zero remaining capacity. Core
derives one compact inspection-exhaustion projection from durable
Turn/candidate/invocation/Part rows, and the primary TUI consumes it instead of
rescanning the last 100 hydrated Messages. It joins:

- `tool_limit` only after the persisted rejected candidate envelope equals the
  exact Part input and its predecessor verifies; copied presentation metadata
  is not authority; and
- `model_limit` only when the immediate same-Session/Turn/Input pending result
  owns the last model and tool ordinals and every other pending result in that
  Turn/Input belongs to its verified `parentOutputFingerprint` ancestry. Two
  independent page-one chains therefore remain generic; older verified
  ancestors do not replace the exact descendant. Because public Turn limits may
  exceed 256, an actual Tool count above the bounded ancestry proof returns
  generic `inspection_ancestry_over_budget` before scanning or attribution.

Zero-prior, competing-chain, intervening-work, malformed, or mismatched cases
remain generic Turn exhaustion and acquire no Gate 22 query, cursor, or
progress. Re-reading durable Turn state after restart reproduces the same
generic or exact projection without depending on a bounded transcript window.

### Primary TUI

Completed owner reads with a valid projection are no longer hidden when generic
Tool detail is collapsed. One Core decoder validates each owner arm against its
only legal owner/record kind and canonical semantics; the primary TUI,
direct-run, and ACP all consume that decoder and the same semantic lines. The
actual session route now delegates its real Tool Part to the tested
primary-TUI body component, so the component test includes Tool-Part binding
and decoding rather than injecting a pre-decoded value. It renders each Context
coverage item, Session/Turn/Input/
operation/action relation, read, citation, command/finalization identity, audit
item, administrative member/frontier/order fact, observation cut, non-causality
statement, and current Tool's later settlement delta. `not_found`, unsupported,
stale, partial, integrity, cursor-source, and bounded-incomplete states remain
separate. Exhaustion additionally renders exact cumulative gaps and continuation
state from the database projection. Interaction search results add visible
status, cumulative complete/gap state, exact predecessor, remaining Turn
capacity, and database-work facts; the raw signed cursor is not substituted for
those learner-visible facts.

The primary Prompt harness now sends the representative inspection/correction
question through the actual TUI Session-start request and proves that neither a
Goal nor revision ID is supplied by the learner. The released-v1 trace consumes
that natural request shape, proves both a stale inspection and an actual stale
Goal correction perform no owner write, renders the typed rejection, re-reads
and re-resolves revision 1, admits exactly one later explicit correction,
re-reads revision 2, and reopens a durable SQLite snapshot with revision-1/2
history and both old/new inspection relations through a fresh Database service.

A separate released-v1 production trace creates 70 terminal roots, pages the
first 64 through two bounded calls, selects the real 65th oversized candidate,
runs bounded materialization, reloads the exact persisted Part as replay truth,
explicitly skips it, continues with the authenticated gap, and reaches
database-owned model exhaustion. The exact persisted Tool Parts and Turn
projection are then loaded from SQLite and passed to the actual primary-TUI
components. No synthetic search fact or constructed Part participates in this
composition evidence.

The ordinary Repa prompt tells the Agent to resolve natural references through
owner reads, request typed inspection, inspect current Context/steering cuts,
continue through bound cursors, and never ask the learner for internal IDs or
claim per-record answer causality.

## Fresh focused evidence

The behavior checks below are bound to this repaired implementation. A final
targeted Prettier pass changed formatting only. The generated SDK remains the
previously regenerated byte-identical carrier; all four affected-package
typechecks ran against the exact current bytes.

| Claim | Command / result |
| --- | --- |
| Shared Core/OpenCode/TUI/generated-SDK types compose | each package's `bun run typecheck` — all four pass |
| Generated schema and migration registry remain current | retained focused migration check — pass; this repair changes no database schema or registry |
| Linked versus independent model-limit ancestry, supported 258-Tool fail-closed truth, file-database restart, one-pass locator/partial-page exactness, and late range with 500 unrelated same-Session rows | focused `packages/core/test/turn.test.ts` selections — 6 pass / 23 assertions |
| Complete FutureAttention binding/finalization-member refusal and cursor/output authentication | Core purpose plus cursor files — 7 pass / 21 assertions |
| Root/bundle/time-bound audit miss, exact stored predecessor, recomputed same-scope high-position conflict, cross-root conflict, raw unknown, and later purge | focused minimal-audit/purge case — 1 pass / 12 assertions |
| Real migrated schema, exact-Turn/no-correlated range plan, conservative work bound, 66-root continuation, and frozen legacy-Context compatibility | Core query-plan plus frozen Context selections — 2 pass / 45 assertions |
| Frozen v24→v34 Context projection/backfill, schema parity, FK/integrity, and current version | focused migration case — 1 pass / 18 assertions |
| Exact range offsets/gaps, durable same-Turn reset detection, missing predecessor ambiguity, and bounded inspection replacement/cancellation | OpenCode Context/range files — 15 pass / 59 assertions |
| Real processor pre-body exhaustion carrier | focused processor selection — 1 pass / 11 assertions |
| Released-v1 Goal inspection plus stale correction rejection/re-resolution/history restart, and real 70-root paging/materialize/replay/skip/exhaustion Parts rendered by primary TUI | two focused prompt selections — 2 pass / 44 assertions |
| ACP shared inspection carrier | ACP Tool file — 10 pass / 44 assertions |
| Literal primary-TUI natural request, actual Tool-Part body, strict canonical/cross-field decoder, and per-item/finalization/exhaustion discriminants | four focused TUI selections — 10 pass / 112 assertions |
| Pinned JavaScript SDK generation and Turn inspection carrier oracle | retained generator output plus fresh `bun run typecheck` — pass; this repair changes no generated public carrier |
| Formatting/whitespace | `git diff --check` — no whitespace error; only existing Windows LF/CRLF warnings |

The released-v1 path uses deterministic local provider fixtures and the actual
Turn/Tool/owner pipeline. The primary component character-frame case uses the
same Core decoder and component mounted by the actual session route. The ACP
and direct-run cases consume the same shared lines rather than raw Tool JSON.

## Explicit limits and non-passes

- An earlier full-current-schema test attempt produced no result for 15 minutes
  and was removed; it is not evidence. Its actual questions are now covered by
  the focused real-schema query-plan, frozen migration, processor, and
  released-v1 cases above.
- The original Bun-hosted `@hey-api/openapi-ts` call crashed natively on Windows
  after OpenAPI construction. The generator owner now invokes the same pinned
  `0.90.10` package under its supported local Node 22 runtime, while Repa still
  builds the OpenAPI input and applies the existing fail-closed post-processing.
  Final full SDK generation and typecheck pass; the temporary OpenAPI file is
  absent.
- Broad package/application aggregates were not run merely to add green count.
  The retained checks correspond to the reported counterexamples and the
  public/generated composition they changed. The deadline is a cooperative
  outer/cross-statement bound; no evidence or claim says it preempts one
  synchronous SQLite statement in mid-execution.
- No credentialed provider/model reliability or pedagogical-efficacy claim is
  made. The implementation concerns program-owned inspection truth and the
  deterministic retained carriers.

## Independent review closure

The first substantive implementation/evidence pass returned `Revise` for
`G22-IR-001..006`. Its first repair successor then returned `Revise` for the
remaining `G22-IR-001..006` impacts plus status defect `G22-IR-007`; neither
pass found an owner blocker. The next review closed `G22-IR-003` and
`G22-IR-007`, retained narrower `G22-IR-001/002/004/005/006` impacts, and added
partial-page exactness finding `G22-IR-008`; it also found no owner blocker.
The following review closed `G22-IR-001/002/004/008`, kept
`G22-IR-003/007` closed, and retained only production-composition evidence
`G22-IR-005` plus physical database-work boundary `G22-IR-006`; no owner blocker
or new finding appeared. This successor replaces Session-filtered correlated
range scans with exact Turn membership queries and a conservative explicit work
bound, and replaces the inferred/synthetic composition evidence with actual
stale-correction and 70-root released-v1 Tool/TUI traces. The accepted contract is
narrowed only for a missing predecessor Part: absence without an independent
surviving producer is source-unavailable-or-unresolved, not caller-proven
deletion or conflict, and no tombstone is added.

The retained reviewer task `019ff945-7b10-7f53-999f-b92dfa68d30c` then closed
`G22-IR-005/006`, confirmed `G22-IR-001/002/003/004/007/008` remained closed,
opened no replacement or new finding, and returned **Accept** under Whole-Gate
run `G22-WG-20260813-019ff8e2-01`. It accepted exact package manifest
`57A15F358CF9C1AF8FA8F79A956D8DD8769A1DF69957AB1F611DE998F418F3BB`
with no owner blocker or material acceptance-changing unknown. The contract/
theory layer was already accepted, so Gate 22 as a whole is accepted and ready
only for its separately governed integration step. This closure authorizes no
integration, stage, commit, publication, release, Gate 23 work, provider-
reliability claim, or pedagogy claim.
