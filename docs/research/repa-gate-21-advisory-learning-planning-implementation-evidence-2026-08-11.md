# Gate 21 advisory learning-plan suggestions implementation/evidence

Status: **contract/theory and implementation/evidence accepted; implementation
integrated into `origin/main`.**
Whole-Gate review run
`G21-WG-20260810-019fe065-01` closed `G21-CR-001..004` and
`G21-IE-001..005`. Retained top-level reviewer
`019fe9c2-c8b6-7913-a988-ab7c955ffd36` is retired after this Gate and must not
be reused.

Date: 2026-08-11

## Exact authority and candidate binding

- accepted contract/theory:
  `docs/research/repa-gate-21-advisory-learning-planning-2026-08-09.md`;
- accepted semantic SHA-256:
  `9CA7DB485C3726752570868A574423F515BD3CC5F536B6285DD4A7A8D69D567C`;
- review-bound raw contract-file SHA-256 before closure-status edits:
  `ECCC7B74D13766186EBCE4581FF742B5288247E212017E3F54A91F77287695CB`;
- review-bound evidence-record SHA-256 before this closure-status edit:
  `05C2F480CBF840A2DFDFA62F21050380058D13B21B17414F97A6AC69F423B8A5`;
- whole-Gate review run: `G21-WG-20260810-019fe065-01`;
- retained independent reviewer task:
  `019fe9c2-c8b6-7913-a988-ab7c955ffd36`;
- derivation branch: `codex/gate-20a-assignment-authority`;
- implementation commit and published upstream branch tip:
  `1e0f1fcaa928b91284d223e677aa22e62058f264`;
- acceptance-time `main` and `origin/main`:
  `c100b431fe174d1993b2baa89a7d1b133300b579`;
- exact reviewer-accepted working-tree package candidate: **46 files / 5,254 canonical
  manifest bytes**, SHA-256
  **`668FBC647AD9C7448F7942E177496A668568FE021CE98AF665C32EE73A598D78`**.
- committed 46-file package projection: **5,254 canonical manifest bytes**,
  SHA-256
  **`4C15DCA06EA0E821748DEC3A6788720A9CAC32F858E11D18B0BA9492D4CFA043`**.

The review manifest is the ordinal path-sorted union of every modified and
untracked file below `packages/`. Each line is
`<repository-relative path><TAB><lowercase SHA-256 of exact file bytes><LF>`;
the UTF-8 manifest is then SHA-256 hashed. Documentation is deliberately
outside this package binding. Before commit, staged diff checking found one
extra blank line at EOF in the formerly untracked re-export file
`advisory-plan-suggestion/constraint-schema.ts`; removing that behavior-free
line and Git's existing clean-filter normalization account for the commit-tree
identity above. No production meaning or test oracle changed. The implementation
commit is published on `origin/codex/gate-20a-assignment-authority`; `main` and
`origin/main` remain unchanged.

## Implementation/evidence review and repairs

The retained reviewer's first implementation/evidence pass bound the original
41-file / 4,672-byte candidate at
`2508B3B3032717D031D304EC4C576B80E106E28FD81135D90D087F679167E374`
and returned `Revise` for `G21-IE-001..005`. Contract/theory remained accepted;
the findings require no new scheduler, selector, runtime, schema migration, or
maintainer product choice. The first repair addressed the original
counterexamples as follows:

- `G21-IE-001`: advisory eligibility now derives Course and View stable keys
  from the Course locator itself, not only from selected item endpoints. A real
  Course whose working selection is cleared remains a bounded authorized
  retrieval anchor, and the later fit filter still evaluates the exact locator.
- `G21-IE-002`: fresh Course dependency projection compares the immutable exact
  membership receipt with owner-native observed-working status. The old
  revision remains pinned while later selection drift is reported separately
  as `working_selection_mismatch`.
- `G21-IE-003`: materialization added a conservative compact-projection check
  before any durable owner write.
- `G21-IE-004`: the released-v1 trace now runs the same teaching request through
  a real read-withheld Session and a real corrected-revision Session. The first
  has no advisory identity, Tool Part, or write. In the second, queued old
  directory and old body branches remain unconsumed while the current directory,
  exact lazy revision/body, and control teaching are consumed through the
  ordinary Session/provider/registry/tool/model loop.
- `G21-IE-005`: one shared ordinary root invocation fixture now composes real
  Goal, Assignment, Material selector, and Gate 19 version-zero evidence refs.
  Focused owner-native tests advance the Goal and Assignment heads, cross an
  Assignment due boundary, withdraw Material, and delete the Gate 19 source
  Session while preserving the immutable advisory revision and reporting the
  correct changed or unavailable relation.

On first repair closure, the retained reviewer closed `G21-IE-001`, `002`,
`004`, and `005`. It kept `G21-IE-003` open because the maximum relation shape
still omitted the `currentRevision` emitted for legal learner-state and
prior-advisory exact refs. A write could therefore pass the admission check and
later make mandatory Context construction exceed 2,048 bytes.

The second repair added those two owner-specific current-revision arms to the
same pre-write relation envelope. Real learner-state and prior-advisory source
revisions now each drive an admitted maximum suggestion through fresh Context;
the complete conservative envelope is exactly 2,048 bytes, and its first extra
summary byte is rejected atomically with `capacity_exceeded`, no owner write,
and no frontier movement. On second repair closure, the reviewer reproduced the
two real-owner tests, measured 2,048 bytes at the admitted boundary and 2,037
bytes in the fresh current projection, closed `G21-IE-003`, and returned final
implementation/evidence `Accept` with no replacement finding, contract reopen,
owner blocker, or material acceptance-changing unknown.

## Implemented claim

Gate 21 adds one LearnerHome-owned `AdvisoryPlanSuggestion` authority for
fallible, source-bearing, correctable Tutor or learner advice about how to
continue learning. It stores multiple scoped alternatives without selecting a
global winner. The program owns identity, immutable revisions, exact sources,
legal transitions, permission, atomic settlement, replay, recovery, bounded
Context delivery, and truthful typed presentation. It does not prove that the
advice is pedagogically optimal, feasible as a schedule, followed by the
learner, evidence of activity, a learner commitment, or proof of mastery.

The implemented product chain is:

```text
ordinary learner/Tutor interaction
-> optional responsive or non-disruptive proactive advice change set
-> immutable active suggestion revisions and compact Context v6 directory
-> authorized exact lazy read in a later Session
-> teaching that consumes the exact revision body
-> natural learner or Tutor revision under the exact current head
-> a fresh Session consumes the successor while exact history remains
```

Explanation, demonstration, guided work, review, and useful zero-write
teaching remain first-class. No deterministic planner, allocator, topic index,
embedding search, hidden selector, adherence tracker, background daemon,
second Agent loop, or generic Context repository was added.

## Core owner, revision topology, and settlement

`packages/core/src/advisory-plan-suggestion.ts` and its `schema`, `sql`, and
constraint modules own the new durable boundary:

- stable suggestion, revision, effect, no-change, and physical receipt
  identities;
- bounded ordered change sets of at most eight intents with exact
  `operationOrdinal` and deterministic `createOrdinal` identity;
- complete immutable revisions with `create | alternative | revise | retire |
  restore`, linear predecessor/current-head relations, and `active | retired`
  disposition;
- an immutable exact `alternativeToRevision` relation that never follows a
  later target head automatically;
- separate revision-authored learner-visible scope, closed retrieval scope,
  authored directory summary, full body, assumptions/uncertainty, and exact
  basis references;
- anchored retrieval through exact Course membership, Material selector, Goal
  revision, Assignment revision, or learner-state judgment revision, plus the
  explicit bounded `learner_home_fallback` for advice with no stable owner
  anchor;
- responsive Tutor proposal, non-disruptive proactive Tutor proposal, learner
  revision, and Tutor revision source arms;
- exact-head/source/alternative revalidation, atomic all-intent settlement,
  stale rejection, and no time-, silence-, completion-, or activity-driven
  mutation; and
- zero-write exact revision, current projection, history, and directory-bound
  discovery reads.

One semantic address has exactly one durable owner: an effect or a no-change
seal. Physical replay returns the stored result. A later identical invocation
reports already applied or the same no-change truth; a changed payload
conflicts. A pre-admitted race loser terminalizes against the winning owner
without fabricating capability evidence. Startup recovery resolves existing
semantic truth before capability state and never blindly applies an admitted
but undispatched candidate.

The structural seal binds the canonical command, generated identities,
materialized change set, exact previous heads, alternative target, revision
rows, retrieval anchors, exact bases, capability issue/settlement, effect or
no-change owner, physical receipt, Tool settlement, and commit seal. Session
deletion preserves committed effect/no-change/revision truth and the minimum
source tombstone while deleting eligible denied, interrupted, or otherwise
no-effect command evidence.

## Forward migration and frozen Gate 20B predecessor

Forward migration
`20260810080004_gate21_advisory_learning_planning` extends the single Repa
SQLite lineage to version 23. It adds the ten owner tables and versioned
structural triggers, extends shared learning-command terminal validation for
Gate 21 effect/no-change owners, and widens `turn_learning_context_cut` to
policy/renderer/catalog generation 6.

The independently frozen Gate 20B fixture supplies a generation-5 cut and a
provider-defined future collision spelling. The upgrade evidence proves:

- the exact historical journal is preserved and the Gate 21 migration appends
  once;
- fresh and upgraded complete `sqlite_schema` manifests and behavior match;
- the exact generation-5 canonical and rendered bytes remain unchanged and
  decode with their original nine-owner catalog;
- the old provider-defined `advisory_plan_suggestion_read` spelling is not
  retroactively promoted into built-in authority;
- no suggestion, revision, anchor, basis, effect, no-change, receipt, or seal
  row is fabricated; and
- foreign-key and structural integrity checks remain clean.

The migration generator reports no incremental drift and reproduces the full
schema from the versioned chain. Historical migration tests needed a 30-second
per-test budget after the additional full V23 schema/trigger comparison; no
migration assertion or production timeout changed.

## LearningContext v6 and exact lazy delivery

The implementation directly extends Gate 18's operation-exact Context and
ordinary tool loop:

- automatic delivery contains at most eight compact active directory entries,
  never full bodies, exact basis sets, or history;
- every semantic byte in the compact entry comes from the immutable revision,
  including the authored summary; the host neither summarizes nor computes a
  composite “stale advice” verdict;
- eligibility is exact retrieval-anchor intersection or the explicit bounded
  fallback arm; request text, keywords, transcript search, embeddings, topic
  models, hidden calls, and pedagogical ranking are not selectors;
- the fallback changes directory discoverability only and does not make the
  advice semantically LearnerHome-wide or higher priority;
- missing read authority yields `not_authorized`, unknown count, no identities,
  and an exact omission reason;
- the directory cursor pins owner frontier, `asOf`, exact eligible-key
  fingerprints, query identity, and non-priority creation order;
- more than eight candidates produce exact count and omission truth, and the
  omitted set remains discoverable only against the original directory cut;
- any later frontier/dependency change makes a pinned old directory/read typed
  stale instead of joining later owner state, while a fresh operation sees the
  successor or drift; and
- maximum authored bodies remain exactly readable within the 32-KiB lazy
  envelope, while compact automatic values stay within the 2-KiB semantic
  bound.

Goal and Assignment projections retain their owner-native current and raw
temporal relations; Course/material, learner-response-evidence, learner-state,
prior suggestion, and Interaction dependencies retain exact admission and
fresh drift/unavailability truth. Exact source revisions never retarget.

## Ordinary Agent, permission, recovery, and retained carriers

The existing released-v1 Agent loop now registers one bounded read tool and one
typed mutation tool. The closed input normalizer, capability catalog, registry,
runtime dispatcher, permission lifecycle, recovery dispatcher, and semantic
presentation were extended; no owner-specific runner was introduced.

- Only an ordinary root Agent may mutate. Restricted or delegated authority
  can independently expose the read, but the write remains hidden and Core
  repeats the root/depth/lineage check against forged direct calls.
- Normal `allow | ask | deny` policy applies. Permission authorizes the exact
  mutation; it is not learner assent to the advice or certification that the
  advice is good.
- The preapproval projection binds every operation, generated identity,
  current head, alternative target, source/cause, learner-visible/retrieval
  scope, authored summary/body, exact bases, and non-implications.
- One versioned semantic projection is retained across primary TUI, direct run,
  attach/ACP, durable Tool Part, replay, and restart.
- Terminal projections distinguish committed, already applied, no change,
  semantic conflict/failure, denial, cancellation, and abort; generic “update
  plan” or “success” prose cannot substitute for exact meaning.
- Live permission abort and startup recovery settle one exact terminal Tool
  Part without re-prompting, blind redispatch, or creating advice.

The provider-visible Repa prompt describes suggestions as revisable,
source-bearing Tutor advice and explicitly keeps teaching, demonstration, and
guided work legal without a durable planning write. It never claims that
advice was followed or that Assignment completion proves learning.

## Product-consumer evidence

The released-v1 production-path oracle uses the real Session -> protected
Context -> provider -> registry -> exact lazy-read Tool Part -> next model
operation path:

1. With no Course, Goal, Assignment, material, evidence, or learner-state
   retrieval anchor, the learner asks for an examples-first way to continue
   studying continuations. The ordinary root Agent writes one explicit
   fallback-scoped suggestion.
2. A fresh Session imports no old transcript. Its protected directory contains
   the exact suggestion locator. The model must call the exact lazy read and
   consume the exact current revision/body before it can select the
   examples-first teaching response.
3. The learner naturally corrects the advice to begin with a plain-language
   definition. One exact-head successor is committed; the old revision remains
   exact history.
4. A later fresh Session, under the same learner request and unrelated owner
   state, consumes the corrected locator/body and changes to definition-first
   teaching. Old/new outputs are mutually exclusive.
5. Absent-state and wrong-revision controls cannot select either teaching
   response. Every expected conditional provider entry must be consumed; a
   canned answer, direct scripted tool call, or task list cannot pass.
6. Separate explanation, demonstration, and guided-work Sessions finish with
   zero advisory invocation, effect, revision, or seal writes.

A second released-v1 trace proves a proactive suggestion can cite an exact
learner-state revision, later Tutor revision can bind the corrected learner
state without automatic recomputation, and exact suggestion history survives
source and Session changes. These traces establish causal wiring, not
credentialed-model reliability or pedagogical optimality.

## Fresh executable evidence

All commands ran from the affected package, never the repository root.

### Current second-repair candidate

- `packages/core: bun run typecheck` — pass.
- `packages/core: bun test test/advisory-plan-suggestion.test.ts
  test/learner-state-judgment.test.ts --max-concurrency=1` — **30 passed / 234
  assertions**. The two new real-owner cases admit exact learner-state and
  prior-advisory revision bases, produce fresh complete Context values, and
  reject the first byte beyond each full 2,048-byte conservative relation
  envelope without an owner write or frontier movement.

### First-repair candidate evidence retained for the closed findings

- `packages/opencode: bun run typecheck` — pass.
- `packages/core: bun test test/advisory-plan-suggestion.test.ts` — **11
  passed / 112 assertions**. This includes the repaired Course locator/selection
  counterexample and alternative-target aggregate boundary.
- `packages/core: bun test test/learning-context.test.ts` — **13 passed / 49
  assertions**.
- Goal exact-ref composition filter — **1 passed / 3 assertions**.
- Assignment head/time composition filter — **1 passed / 4 assertions**.
- real file-backed Material selector withdrawal filter — **1 passed / 3
  assertions**.
- real Gate 19 version-zero/source-deletion composition filter — **1 passed / 3
  assertions**.
- Gate 21 released-v1 causal-consumer filter — **1 passed / 55 assertions**.
  It includes the same-request read-withheld and superseded-directory/body
  controls in addition to creation, exact lazy use, correction, changed
  teaching, and zero-write paths.
- `packages/opencode: bun test test/session/prompt.test.ts
  --max-concurrency=1` — **30 passed / 423 assertions**. The equals-sign form is
  required by Bun 1.3.14 and is the actual serial evidence command.

### First-candidate baseline retained as corroborating evidence

These checks predate `G21-IE-001..005`. They remain relevant to unchanged
migration, carrier, permission, settlement, and recovery surfaces, but the
current-candidate checks above own the repaired findings.

#### Core and migration

- `packages/core: bun run migration --check` — pass.
- `packages/core: bun test test/database-migration.test.ts` — **48 passed /
  500 assertions**.
- `packages/core: bun test test/assignment.test.ts` — **26 passed / 267
  assertions** after updating only the byte-pressure fixture so the accepted
  two-to-one-visible invariant remains exercised under Context v6.
- `packages/core: bun test test/learner-state-judgment.test.ts` — **17 passed /
  114 assertions**.
- `packages/core: bun test test/learner-response-evidence.test.ts` — **7
  passed / 194 assertions**.

#### Schema, OpenCode, and retained carriers

- `packages/schema: bun run typecheck` — pass.
- Gate 21 focused hooks/presentation/runtime/registry filter — **9 passed / 80
  assertions**.
- `packages/opencode: bun test test/learning-command/presentation.test.ts` —
  **20 passed / 130 assertions**.
- `packages/opencode: bun test test/learning-command/hooks.test.ts` — **6
  passed / 27 assertions**.
- `packages/opencode: bun test test/tool/registry.test.ts` — **38 passed / 323
  assertions**.
- `packages/opencode: bun test test/acp/event.test.ts
  test/cli/run/entry.body.test.ts` — **43 passed / 95 assertions**.
- `packages/tui: bun run typecheck` — pass.
- `packages/tui: bun test test/util/semantic-presentation.test.ts` — **6
  passed / 22 assertions**.
- `git diff --check` — exit 0; only the repository's Windows LF-to-CRLF notices
  were emitted.

The learner-state cross-Session Prompt oracle now uses its own disposable
LearnerHome, matching its stated fixed-unrelated-state premise. Without that
isolation, legal data accumulated by unrelated Prompt tests could consume
Context budget and turn a semantic oracle into an unowned aggregate-load test.
No production Context ordering, priority, timeout, or omission behavior changed.

## Harness qualifications kept outside acceptance claims

One full `learning-command/runtime.test.ts` process reported every executed
test as passing, including all Gate 21 runtime cases, then Bun 1.3.14 for
Windows segfaulted during aggregate process teardown at approximately 0.91 GiB
RSS. The focused Gate 21 runtime group passes, and no individual semantic case
reproduced a failure. The crashed aggregate command is disclosed and is not
reported as a passing full-file result.

An initial full Prompt run used the visually plausible but ineffective spelling
`--max-concurrency 1`; Bun 1.3.14 documents and requires
`--max-concurrency=1`. The ignored option left the default concurrency at 20,
so multiple runtime test layers competed for the same process-private exclusive
LearnerHome and 25 cases returned the same typed `DatabaseBusyError`. No
test-owned Bun process remained afterward. The corrected one-variable rerun
above is genuinely serial and passes all 30 cases. A first presentation run
executed all 20 assertions
successfully but its final hook timed out immediately after the runtime crash;
an isolated exact rerun passed 20/20. These are Windows Bun/test-lifecycle
qualifications for later release work, not evidence that advisory semantics
failed. They remain visible to the reviewer rather than being hidden by a
retry.

No credentialed-provider qualification was performed. The deterministic
production-path policy proves exact causal transport and consumption only.

## Decisive counterexamples closed by the candidate

| Counterexample | Required result |
| --- | --- |
| Two valid suggestions prefer examples-first and theory-first. | Keep two active identities in non-priority creation order; the program selects neither as a global winner. |
| Advice has only a current learner occurrence and no durable owner anchor. | Use the explicit bounded fallback directory; a fresh authorized Session can discover it without transcript, keywords, or topic search. |
| A Course/View remains in Context after its working selection is cleared or selects an empty revision. | Derive bounded retrieval keys from the admitted Course locator, retain the exact historical anchor, and report working-selection drift separately. |
| An alternative points to S1/R1 and S1 advances to R2. | Preserve the immutable S1/R1 relation and report target-head drift separately; never retarget A1. |
| A host paraphrase inverts “example before timed practice.” | Reject host-authored semantic summary; Context uses the exact revision-authored directory summary and detail-dependent teaching reads the body. |
| A learner revises only one item in an eight-intent change set. | Commit only changed revisions while preserving one ordered result per intent and atomic change-set settlement. |
| A pre-admitted loser races a winner on one semantic address. | Resolve the effect/no-change owner before permission; report already applied or conflict without a second effect. |
| The learner denies or aborts permission. | Settle truthful denial/interruption and create no suggestion revision or effect. |
| Nine fallback suggestions exist. | Expose exact count/omission, retain eight bounded entries, and discover all nine only from the original directory cut. |
| Maximum authored text plus a valid alternative, learner-state basis, or prior-suggestion basis would exceed the compact semantic ceiling. | Include every compact relation field in the pre-write envelope; admit the complete 2,048-byte envelope, keep its real fresh Context value complete, and reject its first extra byte atomically with `capacity_exceeded`. |
| A source or suggestion changes after an old operation is admitted. | Preserve old cut bytes for retry or return typed stale; a fresh operation sees current drift/successor. |
| The same teaching request has no authorized advisory directory, or exposes a superseded directory/body. | Do not consume the exact-advice teaching branch; only the current directory plus exact lazy revision/body may select it. |
| Goal, Assignment, Material, or Gate 19 evidence changes after becoming an exact advice ref. | Keep the advice revision immutable and use each owner-native relation to report successor, due/expiry, withdrawal, or source deletion truth. |
| Session deletion removes the authoring transcript. | Preserve sealed advice/history and minimum source truth; delete eligible no-effect command evidence. |
| The learner asks directly for explanation or guided work. | Teach without forcing plan management or any advisory write. |
| Permission and settlement UI show only “update plan” / “success.” | Fail closed; all retained carriers use the exact typed proposal/result projection. |

## Nonclaims and review routing

This candidate does not establish a scheduler, allocation solver, calendar,
global plan portfolio, adherence ledger, automatic completion, activity
detector, mastery score, Tutor-move selector, task-success metric, background
service, or release-ready product. It does not claim that the program can
judge whether open-language advice is good. It reuses the mature Agent,
LearningContext, typed tool, permission, settlement, replay, recovery, and
carrier mechanisms because those already own the computational boundary.

Both Gate 21 review layers are accepted and the exact implementation is
integrated into `origin/main` through integration/status commit
`972f0f7256c438ad06f8bfcc211442f81b2b46b2`. This establishes no release,
credentialed-provider qualification, pedagogical-optimality claim,
model-reliability claim, automatic Gate 21A authority, or later-Gate authority.
