# Repa Gates 5/8/12/18 deletion-choice and local-restore implementation/evidence

Status: **exact current implementation/evidence successor accepted by the
retained independent reviewer and integrated with Gate 22 at implementation
commit `ada0a04c19847ce62ae490c90838c88c51a65d72`**

Date: 2026-08-14

Review run: `G22-WG-20260813-019ff8e2-01`

Retained independent reviewer task:
`019ff945-7b10-7f53-999f-b92dfa68d30c`

Implementation base:
`b8100d1c17cd31ec713062c8a1ca5254208899ec`

Accepted prerequisite contract/theory semantic candidate SHA-256:
`79F15DF094A5854C0BECE98D690DE031EAB282607C9AEFAB26124C9EA69811BB`

Review-bound package candidate before this evidence record was written:

- 90 modified or new files under `packages/`;
- 5,402,572 total bytes when the complete candidate files are counted;
- ordinal path/byte-length/file-SHA-256 manifest:
  `C18F06F7D10DD2C183AAD13036EA772B3D28DFE976DC4D852CEEF898D7C93474`.

The retained reviewer accepted that exact package candidate after closing
`G81218-IR-001..003`, with no new acceptance-changing finding or owner blocker.
The exact pre-disposition evidence record reviewed in the final pass had
SHA-256
`E2FEADB082837E5D8E11E1A01370CB860A36E26D1604EC8E5DDA313E378690D9`.
This status paragraph is a documentation-only successor; it changes no package
byte and does not integrate, commit, publish, or release the implementation.

Current correction notice (2026-08-22): the later Gate 22 contract review found
that several production-shaped `learning_material_query` results produced no
exact-read relation and flat alignment could produce the selector relation.
That defect reaches this record's “complete producer-derived audit” claim but
does not change deletion choice, retention allowlist, subtree settlement,
restore/copy, administrative history, presentation frontier, or any other
accepted behavior. The working-tree successor preserves the catalog, versions
an action-complete material projection as result schema 2, keeps historical
version 1 immutable/unavailable for stronger inference and refuses minimal-
audit sealing for a completed version-1 material query, fences supplemental
inspection data, covers disposition/outline/pinned multi-record actions, fails
closed for an unknown future action, and passes focused candidate-to-operation-
to-minimal-audit evidence. The detailed focused observations are in the
[Gate 18 implementation/evidence record](repa-gate-18-learning-context-session-continuation-implementation-evidence-2026-08-04.md).
The previous 90-path manifest remains exact accepted-predecessor provenance;
the current successor still contains 90 package paths, totals 5,424,504 bytes,
and has ordinal path/byte-length/file-SHA-256 manifest
`334CDCAEEA573A8257E8F3B67A8A4AE9550F06522B3E85645B974CE126C4CBE6`.
Only the five material-lineage production/test files named in the Gate 18
evidence successor differ from the accepted predecessor. The retained reviewer
reproduced the focused evidence and manifest, closed `G22-CR-002`, and accepted
this exact successor as the current implementation/evidence layer. No package
byte changed after that verdict.

The manifest covers production, migrations, generated clients, and tests. It
does not include this record or status-document propagation. Exact hashes of
those documentation files and the final checkout status are frozen separately
at review dispatch.

This record implements only the independently accepted bounded correction to
[Gate 5](opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md),
[Gate 8](opencode-fork-gate-08-learning-command-settlement-2026-07-16.md),
[Gate 12](opencode-fork-gate-12-durable-turn-lifecycle-2026-07-18.md), and
[Gate 18](repa-gate-18-learning-context-session-continuation-2026-08-03.md).
The owning contract is
[the learner-chosen Session-deletion and local-restore correction](repa-gate-05-08-12-18-session-deletion-choice-correction-2026-08-13.md).

Gate 22 remains separate, review-revised, and unaccepted. This prerequisite
supplies the producer and owner-neutral read surface that Gate 22 may consume;
its material exact-read arm is the bounded correction above. It does not add
Gate 22's general natural-language inspect/correct composition and does not
count a diagnostic or prepared fixture as that later product surface.

## Implemented outcome

The candidate replaces one ambiguous Session deletion with an exact displayed
proposal and an explicit learner-selected mode:

```text
live root + exact ordered descendant closure
+ full | minimal_audit
-> immutable displayed proposal
-> exact permission-bound commit
-> body deletion + mandatory body-free control settlement
-> optional sealed non-causal audit only for minimal_audit
```

The implementation also makes deletion final at the original root Session
address inside one database. A local JSON backup can be restored with exact
identity only into another database. In the same database it can be admitted
only through an explicit copy proposal that maps the complete imported graph to
fresh identities and composes one genuine new root Turn. There is no silent
fallback between those meanings.

## Ownership and production boundaries

| Boundary | Production owner and implementation |
| --- | --- |
| Destructive request identity and replay | `@opencode-ai/core/session-deletion` owns the database-scoped root address, proposal fingerprint, immutable control settlement, physical request identity, audit-purge settlement, current projection, and typed conflicts. |
| Whole-subtree deletion | OpenCode `Session.proposeRemoval` and `Session.commitRemoval` compute and recheck one exact root/descendant closure, then compose the existing Turn, command, Event, Session, Message, Part, and Context deletion inside one transaction. |
| Busy and race truth | `SessionRunState.closeMany` uses the non-waiting `closeIfIdle` boundary. Any valid admitting, running, terminalizing, shared-reader, shell, or mutation owner returns busy without cancellation or durable mutation. Materialization and deletion serialize through the same Session lifecycle and transactional root-retirement checks. |
| Optional audit facts | `@opencode-ai/core/turn-lineage` seals admitted interactive model-operation coverage and projects only Context classification, exact lazy-read occurrence, first-applied registered typed citation, and terminal model-operation status. |
| Imported administrative history | `SessionImportHistory` decodes a closed local bundle, rejects executable or ambiguous control state, performs exact-restore or full fresh-ID copy admission, and installs one complete historical-only membership/seal. |
| Presentation order | `@opencode-ai/core/session-presentation` owns one durable Session frontier. `EventV2Bridge` and every retained Message writer reserve a serialized strict-successor block; raw wall time and Message IDs are not order authority. |
| Public carriers | The retained OpenCode HttpApi exposes proposal, commit, projection, and purge; the generated JavaScript SDK carries the same required request bodies and nullable root-parent truth; and the primary TUI requires a mode choice and displays the exact root/descendant scope before confirmation. Protocol, the separate Server data API, and its generated Client do not expose Session deletion and are not deletion carriers; their related correction is limited to typed `session_id_retired` refusal on Session materialization. |

The mandatory deletion control receipt and the optional audit remain separate.
Purging the audit does not rewrite the original deletion time, release the root
ID, recreate bodies, or erase the physical deletion result. Neither record is
a learning authority, a universal activity log, a model-rationale record, or a
claim that one owner record caused model-authored prose.

## Deletion lifecycle and failure behavior

The legal durable transitions are exactly:

```text
live -> deleted_full
live -> deleted_minimal_audit -> deleted_minimal_audit_purged
```

There is no `deleted_full -> deleted_minimal_audit` transition, no audit
reconstruction, and no deleted-to-live transition at the original address.

The proposal binds:

- one request ID and immutable request fingerprint;
- the exact root Session ID;
- the ordered complete descendant descriptor and count;
- one subtree fingerprint;
- one uniform `full` or `minimal_audit` mode; and
- the proposal schema version used by permission and commit.

Commit rechecks the process-local proposal, current root status, exact subtree,
active owners, and transactional identity state. A changed child set or
reparenting returns `session_tree_changed`; active work returns
`session_tree_busy` or the public busy projection; reused physical identity
returns invocation conflict. These paths emit no deletion, interruption,
cancellation, Session Event, receipt, or partial audit.

Once committed, the exact physical request replays the original settlement and
deletion time. A fresh same-mode request reports `already_deleted`; a fresh
different-mode request reports `deletion_mode_conflict`. Each returns the exact
stored settlement bytes and current audit availability. Audit purge has its own
proposal, request fingerprint, settlement, replay, and conflict behavior.

## Body-free audit production

The audit is derived before prohibited Session bodies disappear, but it is not
the original fact owner. For every admitted interactive model operation in the
deleted subtree, the producer path seals:

- exact operation identity and ordinal;
- terminal status `completed | failed | interrupted`;
- a closed candidate set and complete producer coverage;
- Context classification `not_entered | locator_only | semantic_full` from the
  immutable operation cut;
- an exact successful lazy-read occurrence from the closed read catalog and
  terminal Tool result;
- an exact first-applied registered owner-command citation; and
- record identity, exact revision identity/version, relation kind, producer
  Tool Part, and producer schema version.

Candidate coverage is verified per producer Part. The implementation rejects a
wrong owner kind, unknown producer version, stale candidate catalog/result
version, count/fingerprint mismatch, unsupported history, or missing operation
coverage. Relation absence becomes a truthful negative only after the complete
candidate and operation seals pass; a partially stored union never becomes a
fabricated `false`.

The audit retains no transcript, Context, Tool input/output, task-result,
source-body, model-rationale, purpose, selected-action, or arbitrary metadata
body. It reports operational entry/read/citation/terminal facts only.

### Pre-migration recovery

Schema version 31 marks only model operations already present when the new
coverage schema is installed and lacking a complete seal. Deletion may
materialize coverage lazily only for those exact marked pre-migration
operations, from their immutable live producers, inside the deletion
transaction. A successful seal consumes the marker. A new or post-migration
operation with missing coverage still fails deletion atomically; it cannot use
the legacy path to manufacture completeness.

Schema version 32 makes producer occurrence part of the relation identity so
two typed producer Parts cannot collapse into one apparent citation. Candidate
coverage verifies its own relation subset and producer version before the
operation seal can be accepted.

## Restore, copy, and administrative history

`SessionImportHistory` accepts only a local JSON bundle whose root graph is
complete, renderable, closed, and internally reference-safe. It refuses, before
materialization:

- zero-Message or non-renderable Session history;
- duplicate, dangling, external, or unstable typed identities;
- pending/running Tool Parts, nonterminal Assistant Messages, unmatched steps,
  unresolved compaction/subtask state, or incomplete membership;
- every nonempty imported `Session.revert` target, snapshot, or diff;
- unknown bundle, mapping, classifier, order, or frontier versions; and
- an unrepresentable strict-successor frontier.

Exact restore preserves source Session/Message/Part identity and source
presentation times, but is admitted only into another database where every
identity is unoccupied. Same-home copy requires a separately displayed and
confirmed proposal. It maps the complete Session/Message/Part/nested attachment,
Turn/Input/occurrence, compaction, and retained typed-reference graph to fresh
identities, normalizes a stable target presentation order, and starts one fresh
learner root Turn. The copy carries no old Turn, Context, lazy-read, citation,
command, or learning-effect lineage.

Both paths install one atomic administrative-history seal covering every
imported Message, Part, embedded attachment, ordinal, source order, and
classifier version. Integrity checks reject both missing members and extra
unclassified Parts. Imported rows and imported Patch Parts remain visible as
historical presentation but are excluded from current-work discovery,
continuation ownership, Turn recovery, compaction ownership, Tool recovery,
Context execution, and transcript mutation.

Revert, unrevert, cleanup, Part update, Message-with-Parts update, and direct
HTTP Part mutation all recheck the administrative parent/membership. Imported
history returns typed `historical_presentation_not_revertible` before snapshot,
worktree, `Session.revert`, transcript, or frontier mutation. A later genuine
local revert operates only on the canonical post-frontier suffix.

The implementation scans exact target identities across live and retained
Session, Message, Part, nested attachment, Turn, unavailable-Turn, Input,
historical-input, learning-command, learner-response, child-lineage/result,
retention, future-attention, and proposal carriers. A collision refuses the
whole restore/copy transaction rather than relying on one live-row check.

## One frontier for every transcript writer

The durable frontier is the monotonic maximum of the imported seed and every
later committed Message. A writer reserves its complete strict-successor block
through the serialized Session mutation boundary before transcript, model,
Tool, Event, shell, snapshot, or worktree effects begin.

The production consumers include:

- ordinary root and continued Turns;
- learner User, model Assistant, Tool, and terminal presentation;
- direct shell/admin transcript utilities;
- compaction summary and continuation presentation;
- processor, recovery, plan, and other program-owned Message writers; and
- exact physical replay after response loss or restart.

Compaction now reserves its Assistant block before plugin or model effects and
removes an uncommitted reservation/presentation on failure or interruption.
An exhausted or unrepresentable frontier therefore begins no plugin, model,
transcript, or Event effect. Embedded displayed `time.created` cannot be
rewritten independently of the immutable ordering column. `plan_exit` performs
the same integrity/representability preflight before emitting its learner
question Event; after an affirmative answer, the synthetic User presentation's
atomic write rechecks and claims the current exact block.

The first and every later local block remain strict successors under a future
source timestamp, target-clock regression, restart, or response loss. Paging
and Gate 18 Context consume the same canonical Session order.

## Schema and migration chain

The current schema advances the frozen v24 database through eight versioned
migrations:

| Version | Migration | Purpose |
| --- | --- | --- |
| 25 | `20260813111949_gate22_session_deletion_restore_lineage` | Control/audit/purge receipts, operation/candidate/relation coverage, administrative-history membership, and Session frontier. |
| 26 | `20260813124045_gate22_restore_lineage_followup` | LearnerHome identity, source presentation time, and corrected relation/audit/history structural keys. |
| 27 | `20260813130151_gate22_lineage_candidate_identity` | Closed Tool-candidate identity needed for producer-complete audit negatives. |
| 28 | `20260813140546_gate22_owner_kind_allowlist` | Exact native owner-kind allowlist for lineage and audit records. |
| 29 | `20260813143000_gate22_presentation_frontier_delete_count` | Frontier and delete-count trigger correction. |
| 30 | `20260814005504_gate22_embedded_history_identity` | Nested imported-Part identity and matching integrity constraints. |
| 31 | `20260814012438_gate22_lineage_legacy_capture` | Explicit pre-migration operation markers for bounded lazy coverage recovery. |
| 32 | `20260814040835_gate22_lineage_producer_occurrence` | Producer-Part occurrence in relation identity and graph rebuild. |

Schema extras are split at v24/v25 so a frozen v24 fixture is not retroactively
equipped with current triggers. The generated manifest, migration registry, and
schema JSON all name v32 as current. The migration check compares incremental
and full current structure without downgrading a current database.

## Learner-visible and programmatic carriers

The primary TUI Session list does not choose a deletion mode silently. It asks
for `minimal_audit` or `full`, then displays the selected mode, root, complete
descendant closure, and count before the destructive confirmation. It submits
the exact displayed proposal, not a reconstructed root ID.

The retained OpenCode HttpApi surface provides typed endpoints for:

- deletion proposal;
- exact proposal commit;
- current live/missing/deleted/audit projection;
- audit-purge proposal; and
- exact audit-purge commit/replay.

Its generated JavaScript SDK carries the same required proposal/commit/purge
bodies, nullable root-parent value, and typed busy, invocation-conflict,
projection, and audit-unavailable errors. Protocol, `packages/server`, and the
generated `packages/client` data API expose no deletion-lifecycle endpoint and
are not claimed as alternate deletion carriers; they carry only the separate
typed `session_id_retired` creation/materialization refusal required by root
retirement. The local CLI import requires explicit `exact` or `copy` meaning
and confirmation; HTTP(S) import remains rejected before a network request.
Export files remain learner-managed local files outside the Session deletion
transaction.

## Executable evidence

All passing results below are from the production checkout named above. A
filtered count means only the named causal scenario was run; it is not presented
as a full-file pass.

| Boundary | Command/result |
| --- | --- |
| Core Turn and lineage | `packages/core`: `bun test test/turn.test.ts` — 35 pass, 313 assertions. |
| Core deletion and presentation | `packages/core`: `bun test test/session-deletion-presentation.test.ts` — 8 pass, 52 assertions. |
| Frozen migration | `packages/core`: frozen v24→v32 migration case — 1 pass, 15 assertions. |
| Migration drift | `packages/core`: `bun run migration --check` — incremental schema unchanged and full current schema generated successfully. |
| Core types | `packages/core`: `bun run typecheck` — pass. |
| Compaction/frontier | `packages/opencode`: full `test/session/compaction.test.ts` — 59 pass, 1 pre-existing v2-projector skip, 193 assertions. |
| Import decoder | `packages/opencode`: full `test/session/import-history.test.ts` — 7 pass, 47 assertions. |
| Same-home copy | Named prompt case — 1 pass, 78 assertions. |
| Exact restore/restart/frontier | Named prompt case — 1 pass, 55 assertions. |
| Exact restore retained-identity refusal | Named prompt case — 1 pass, 5 assertions. |
| Retired root materialization | Named prompt case — 1 pass, 12 assertions. |
| Materialization/deletion race | Named prompt case — 1 pass, 9 assertions. |
| Active-work deletion refusal | Named prompt case — 1 pass, 16 assertions. |
| Audit-purge replay | Named prompt case — 1 pass, 12 assertions. |
| Assignment typed citation/audit | Named learning-command case — 1 pass, 16 assertions. |
| Imported revert/Part protection | Named revert/compact case — 1 pass, 13 assertions. |
| Plan/frontier | Positive named prompt case — 1 pass, 5 assertions; affirmative answer appends one strict-successor synthetic User presentation. Exhausted-frontier named case — 1 pass, 5 assertions; no question Event and no transcript change. |
| Public HTTP deletion lifecycle | Proposal→commit→projection→purge→replay case — 1 pass, 8 assertions. |
| Public HTTP missing/busy behavior | Missing proposal case — 1 pass, 12 assertions; real closing-window mutation case — 1 pass, 2 assertions. |
| Public OpenAPI deletion contract | Full `test/server/httpapi-public-openapi.test.ts` — 26 pass, 207 assertions. The deletion oracle requires all three destructive request bodies and preserves `null` for a root target's parent in both commit input and proposal output. |
| Generated JavaScript SDK deletion path | Named `httpapi-sdk.test.ts` case — 1 pass, 4 assertions on the one registered `raw` HttpApi scenario. It obtains a `full` root proposal with `parentSessionID: null`, submits that exact proposal through the generated SDK, observes committed deletion, and then observes not-found. The generically named `serverPathParity` helper registers only `scenario("raw")`; this result does not claim a distinct second server-path execution. |
| Local CLI import | Full `test/cli/import.test.ts` — 2 pass, 7 assertions. |
| OpenCode types | `packages/opencode`: `bun run typecheck` — pass. |
| TUI deletion choice | `packages/tui`: full `test/component/dialog-session-list.test.ts` — 8 pass, 11 assertions. |
| Deletion SDK generation and types | `packages/sdk/js`: the official build completed twice consecutively with the recorded Windows Bun settings; the second run left all 15 generated files byte-identical. Its compile-time codegen contract requires the proposal, commit, and purge bodies and every exact field, plus `string | null` root-parent truth, in both data types and flat SDK methods. `bun run typecheck` — pass. |
| Non-deletion data API | `packages/protocol`, `packages/server`, and `packages/client` typechecks — pass; repeated Client generation left both generated files byte-stable. This evidence applies to typed `session_id_retired` creation refusal only, not deletion-carrier parity. |

The evidence includes positive retained-audit records and truthful negatives;
wrong catalog/result/producer versions; missing coverage; unsupported owner
kinds; pre-migration completed/failed/interrupted operations; body-deletion and
projection rollback; response-loss replay; mode conflict; changed subtree;
busy preflight and race; retired-root recreation; empty/unfinished/live-revert
import; target and nested identity collision; future source time; regressed
clock; direct shell; compaction before plugin/model effects; restart; frontier
exhaustion before a `plan_exit` question Event; imported Patch targeting; and
local-only revert cleanup.

## Non-green observations and limits

These observations are retained rather than converted into passing evidence:

- Bun 1.3.14 on Windows twice segfaulted while running the complete
  `httpapi-session.test.ts` file. Before the first crash, the new deletion
  lifecycle case passed and two obsolete tests exposed real test-contract
  mismatches: a naked DELETE no longer reaches NotFound without its required
  proposal body, and deletion must no longer wait for an occupied Session to
  enter `closing`. Both tests were corrected and their exact paths then passed
  independently. A serialized aggregate retry segfaulted before producing a
  usable oracle.
- One multi-scenario prompt filter let independent fixtures share process
  state, contaminating whole-database receipt assertions and a mocked
  model/clock configuration. Receipt assertions were narrowed to their exact
  root Session and every scenario passed in its intended isolated invocation.
  A later broad `plan exit` name filter likewise scheduled its two exact cases
  concurrently against one temporary LearnerHome and one received typed
  `DatabaseBusyError`; the positive and exhausted-frontier cases each passed
  when invoked by their exact names. Neither contaminated aggregate run is
  counted above.
- Before the first independent implementation review, JavaScript SDK repeat
  generation had produced a Windows file-write/formatter error and a later Bun
  stall after the generator's `clean` phase; those attempts are not counted as
  passing evidence. The `G81218-IR-001` repair fixed the owning public OpenAPI
  normalization, added a guarded generator correction for the pinned
  `@hey-api/openapi-ts` flat-body defect, and added a compile-time generated-type
  oracle. The official build then completed twice consecutively with Bun's
  runtime cache disabled and bounded JSC RAM; the second pass reported zero
  hash differences across all 15 generated files, removed temporary
  `openapi.json`, and left no generator process. The SDK package typecheck also
  passes.
- An accidental root aggregate typecheck reached the excluded Slack package and
  failed on retired standalone `Session.create/share` SDK methods. Repository
  guidance explicitly rejects root aggregate qualification and requires owning
  package checks; no claim here relies on that run. The affected Core,
  OpenCode, Protocol, Server, Client, SDK, and TUI package checks pass.

No external network, credentials, paid provider, release artifact, push, or
deployment was used. Arbitrary out-of-band SQL remains outside the semantic
forensics guarantee, as specified by repository policy; all supported
application transitions are covered by service checks plus versioned SQLite
constraints.

## Independent review disposition

Under Whole-Gate run `G22-WG-20260813-019ff8e2-01`, retained reviewer
`019ff945-7b10-7f53-999f-b92dfa68d30c` inspected the exact package manifest,
migrations, production paths, generated carriers, failure behavior, evidence
commands, non-green observations, and documentation propagation. The first
pass returned `Revise` with `G81218-IR-001..002`; the next pass closed both and
opened `G81218-IR-003` against an unsupported two-server-path evidence claim.
The final documentation-only rebound narrowed that claim to the one registered
`raw` HttpApi scenario. The same reviewer closed `G81218-IR-003` and returned
**Accept** with no new finding.

The accepted review falsification boundary covered at least:

1. deletion never interrupts or waits for active work and never commits partial
   bodies, receipt, or audit;
2. the mandatory settlement remains replayable after full deletion and audit
   purge without widening retained content;
3. every admitted operation has complete producer-owned coverage or deletion
   refuses atomically;
4. pre-migration recovery cannot authorize a post-migration missing seal;
5. exact restore, fresh copy, permanent root retirement, and response-loss
   replay cannot collide at any retained identity carrier;
6. imported history is visible but cannot become current executable/revertible
   work or acquire old operational lineage;
7. every supported transcript writer reserves the same strict-successor
   frontier before effects; and
8. the retained OpenCode HttpApi, generated JavaScript SDK, and primary TUI
   carry the same exact proposal and settlement truth, while Protocol, the
   separate Server data API, and its generated Client are not falsely treated
   as deletion carriers.

Gate 22 contract/theory and implementation/evidence remain separate later
review layers. This prerequisite acceptance removes Gate 22's producer
dependency; it does not accept Gate 22, prove per-record causal influence,
establish a scheduler or activity ledger, or authorize Gate 23, integration,
publication, or release.

## Subsequent integration

Gate 22 later closed both review layers. After that acceptance, the maintainer
separately authorized commit and push. This prerequisite successor is included
in Gate 22 implementation commit
`ada0a04c19847ce62ae490c90838c88c51a65d72`; the final Gate 22 evidence record
owns the accepted combined working-tree and commit-tree manifests. Integration
changes none of this record's evidence scope and does not accept Gate 23 or
claim release readiness.
