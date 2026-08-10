# Gate 20B learner-state judgment memory implementation/evidence candidate

Status: **implementation/evidence accepted; Gate 20B Whole Gate is ready for its
separately governed local integration step.** Under whole-Gate review run
`G20B-WG-20260809-019fe065-01`, retained reviewer
`019fe6da-d33f-71f1-b405-1cf240c7862a` accepted this exact first-repair package
candidate and closed `G20B-IE-001..004`. This record does not itself integrate,
commit, push, release, qualify a credentialed provider, authorize Gate 21
merits, or authorize a later Gate.

Date: 2026-08-10

## Exact authority and candidate binding

- accepted contract/theory:
  `docs/research/repa-gate-20b-learner-state-judgment-memory-2026-08-09.md`;
- accepted semantic SHA-256:
  `FF6EAB7002C26338E0344060646B440D2D9EE5DE704C9F75620ABFEFA10BCC54`;
- whole-Gate review run: `G20B-WG-20260809-019fe065-01`;
- retained independent reviewer task:
  `019fe6da-d33f-71f1-b405-1cf240c7862a`;
- accepted reviewed evidence-record SHA-256:
  `29E1E165E3CBE292DE184BC22B3179905FE7B8E981FBB1065BB4E7C635D1D7DC`;
- derivation branch: `codex/gate-20a-assignment-authority`;
- derivation HEAD and published branch tip:
  `28f045eb6d51375f69da080685a394de65903f9a`;
- `main` and `origin/main` at candidate binding:
  `c100b431fe174d1993b2baa89a7d1b133300b579`;
- exact package production/test candidate: **42 files / 4,791 canonical
  manifest bytes**, SHA-256
  **`1F5CCB66B82D258C7689846FBD839907C5CC42CF8FA70138BF2B6064D052146A`**.

The package manifest is the ordinal path-sorted union of every modified and
untracked file below `packages/`. Each manifest line is
`<repository-relative path><TAB><lowercase SHA-256 of exact file bytes><LF>`;
the manifest itself is then SHA-256 hashed. Product, architecture, roadmap, status, ledger,
Gate-contract, and root `AGENTS.md` changes are intentionally outside this
package implementation/test binding. The retained reviewer independently
recomputed and matched this manifest before acceptance.

At this binding the candidate is unstaged and uncommitted. The executor has not
changed a Git ref, index entry, remote, release artifact, credentialed provider,
or external durable system.

## Implemented claim

The candidate adds one LearnerHome-owned `LearnerStateJudgment` authority for a
fallible, source-bearing, correctable statement about what the learner has
learned, roughly understands, can do, or still finds difficult. It preserves
one indivisible `judgmentBody + exactBasisRefs` value per immutable revision.
The program proves identity, bounded shape, exact source and producer locators,
legal transition, current-head precondition, capability outcome, atomic
settlement, replay, recovery, and Context delivery. It does not prove mastery,
pedagogical correctness, entailment of an individual clause, activity,
progress, adherence, or plan success.

The implemented product chain is:

```text
ordinary teaching or learner report
-> optional source-bearing fuzzy judgment write through the existing command path
-> immutable current revision and compact Context v5 directory entry
-> authorized exact lazy owner read in a later Session
-> teaching adapted to the retained judgment
-> natural learner correction appends a successor
-> a fresh later Session adapts differently
```

Useful explanation, demonstration, and guided work remain legal at zero
learner-state writes. The implementation contains no post-turn bookkeeping
requirement, keyword classifier, deterministic mastery evaluator, separate
memory runner, generic RAG store, scheduler, or second Agent loop.

## Core owner and durable semantics

`packages/core/src/learner-state-judgment.ts` and its `schema`, `sql`, and
constraint modules own the new boundary:

- stable judgment, revision, and effect identities;
- complete immutable revisions with linear positive versions and exact
  predecessor/current-head relations;
- closed `create | revise | retire | restore` transitions and
  `active | retired` dispositions;
- LearnerHome-wide subjects or at most eight exact Course membership, Material
  selector, Goal revision, or Assignment revision anchors;
- up to sixteen exact whole-judgment basis references, including exact
  learner-response-evidence revisions and Interaction ranges;
- four retained authorship/cause arms:
  `interpreted_learner_report`, `tutor_model_judgment`,
  `exact_owner_observation`, and `learner_correction`;
- exact-head compare-and-set, stale rejection, source drift/unavailability,
  correction lineage, and no time-based decay or automatic revision;
- bounded minimal source-admission receipts rather than copied transcript or
  arbitrary owner bodies; and
- exact current, exact revision, bounded history, and bounded discovery reads
  that are zero-write and return typed stale truth when a pinned directory or
  dependency cut cannot be reproduced.

The owner keeps source claims syntactically honest without pretending to judge
natural-language entailment. A Tutor-authored judgment must be bound to its
exact root model operation and Context cut and cite an Interaction/evidence or
source fact actually used. An exact-owner observation must cite an accepted
exact owner revision or selector. Learner correction is bound to the exact
learner occurrence and excerpt. The full judgment and basis set are explicitly
whole-value provenance; there is no clause ontology or mastery scalar.

The supported database graph structurally seals the admitted candidate,
permission issue/settlement, effect or no-change owner, immutable revision and
bindings, physical receipt, Tool settlement, and commit seal. A fixed semantic
address has exactly one durable owner: an effect or a no-change seal. Physical
replay returns its stored settlement; an identical later invocation reports
already applied; a changed payload conflicts. Pre-admitted race losers
terminalize against the winning owner without rewriting their admission
evidence. Recovery resolves committed semantic truth before capability state
and never commits an un-dispatched candidate.

Session deletion preserves committed effect/no-change facts while removing
unsealed, denied, interrupted, or otherwise no-effect invocation evidence. The
new owner participates in the existing minimal source-retention/tombstone
boundary; it does not retain a full deleted transcript.

## Forward migration and frozen predecessor

Migration
`20260809150754_gate20b_learner_state_judgment` extends the one Repa SQLite
lineage. It adds the owner tables and structural triggers, widens the shared
learning-command terminal rules for exact Gate 20B effect/no-change owners, and
widens `turn_learning_context_cut` to policy/renderer/catalog generation 5.

The migration does not rebuild a planner database or import historical
OpenCode/ALS state. The independently authored frozen Gate 20A fixture carries
an exact generation-4 Context cut and historical provider-tool collision. The
upgrade oracle proves:

- the full pre-migration journal is exact and the Gate 20B row appends once;
- fresh and upgraded current `sqlite_schema` manifests are identical;
- the frozen generation-4 canonical cut and rendered bytes are unchanged and
  still decode with their original seven-plus-Assignment owner generation;
- the old provider-defined `learner_state_judgment_read` spelling is not
  retroactively promoted into a built-in lazy capability;
- no judgment, revision, binding, effect, no-change, receipt, or seal row is
  fabricated; and
- foreign-key and structural integrity checks remain clean.

The migration generator was extended only to register the new owner and its
versioned extras. `bun run migration --check` reports no incremental drift and
reproduces the complete schema from the migration chain.

## LearningContext v5 and lazy reuse

The candidate directly extends the accepted Gate 18 mechanism rather than
creating another memory transport:

- the operation-exact `turn_learning_context_cut` remains the canonical owner
  of one immutable model-operation cut;
- the v5 automatic section contains at most eight compact active judgment
  directory entries, never the full judgment body, basis set, or history;
- eligibility is structural: a judgment is LearnerHome-wide or its exact
  subject anchors intersect exact anchors already present in the current cut;
  request keywords, embeddings, hidden models, and ranking are not selectors;
- when the read capability is absent, the section reports
  `not_authorized`, unknown count, and no identities; it does not look empty;
- candidate-limit and byte-budget omissions remain explicit and bounded, and
  the directory token pins owner cut, structural-anchor fingerprints, exact
  eligible-anchor fingerprints, and `asOf` for the first lazy page;
- the compact directory token supports the maximum 96 anchors exposed by the
  current Context composition without embedding their full records;
- exact owner reads continue through the ordinary registry, permission,
  provider tool-call, Tool Part, and next-model-operation path;
- old admitted cuts and provider retries remain byte-exact, while a fresh
  operation sees a corrected successor; and
- compaction remains an internal no-tools operation and does not become
  learner-state truth.

Context v5 also separates canonical transport identity from model-facing
resource use. The stored canonical cut still binds every exact provider
definition fingerprint and byte count. The protected model-facing block renders
only the definition count, aggregate canonical bytes/fingerprint, overall
provider-surface fingerprint, and tool-choice seal. This removed repeated
per-definition rows from the prompt without weakening replay or capability
validation. Frozen v1-v4 renderers, catalogs, owner sets, and bytes remain
unchanged.

The fit policy preserves one useful authorized representative for each
applicable owner family before spending residual budget on extra entries.
Learner-response evidence and learner-state compact values stay semantic rather
than degrading into unusable locators; excess candidates are omitted with
exact reasons. This is a resource non-starvation rule, not a pedagogical
priority or selected Tutor move.

## Ordinary Agent, tools, permission, and presentation

The OpenCode side adds one bounded read tool and one typed mutation tool to the
existing released-v1 Agent loop. It extends the closed learning-command input,
runtime, registry, presentation, and recovery dispatch rather than introducing
a learner-state-specific executor.

- The ordinary root Agent may write through configured `allow | ask | deny`
  policy. A delegated child may receive the read capability but never the
  mutation capability, even if a child ruleset tries to allow it; Core repeats
  the root/depth/lineage check against forged direct calls.
- Permission presentation binds the exact command, subject, fallible whole
  judgment, basis/source shape, expected head, and non-implications. Permission
  grants authority to perform the mutation; it is not epistemic acceptance.
- Terminal typed carriers distinguish committed, already-applied, no-change,
  conflict, denial, interruption, and failure without rendering any as mastery
  certification.
- Live permission abort and startup recovery settle one exact terminal Tool
  Part without re-prompting, blind redispatch, or creating a revision.
- Owner reads use the existing 32-KiB/64-item learning-context result guard and
  never return a silently truncated judgment body.
- The provider-visible Repa prompt says to write only when a fallible retained
  judgment has durable teaching/review value, to cite exact used sources, to
  correct an exact head through natural dialogue, and to leave useful teaching
  at zero write when no durable update is warranted.

## Product-consumer evidence

The released-v1 Session trace exercises the actual Session -> registry ->
provider -> typed tool -> Tool Part -> next model-operation path rather than a
Core-only projection:

1. Session A teaches and writes a source-bearing fallible judgment that the
   learner understands a binary-search invariant definition but remains
   uncertain applying it.
2. Session B imports no Session A transcript. Its protected v5 directory points
   to the exact judgment; the ordinary Agent performs the exact lazy read and
   teaches the application step rather than repeating the definition.
3. The learner naturally corrects the judgment in Session C, stating that the
   definition itself remains unclear. The ordinary command appends a successor
   under the exact current head.
4. Session D receives a fresh cut, reads the corrected revision, and changes to
   definition-focused teaching while the prior revision remains exact history.
5. A separate useful explanation/demonstration Session completes with no
   learner-state invocation, effect, revision, or seal.

Session deletion removes those transcripts while the exact corrected revision
and its source-unavailable/tombstoned dependency truth remain inspectable. No
test claims that the model's judgment is objectively correct or that the
changed teaching move proves educational efficacy.

The deterministic provider is not preloaded with those two teaching answers.
One fixed response policy is used for both teaching Sessions. It selects a move
only when the real provider request contains the expected protected directory
revision and the following real Tool Part contains the same exact revision and
whole-judgment body. An absent-state request and wrong-revision controls do not
match; each expected policy entry must be consumed; and the old and corrected
teaching outputs are mutually exclusive. This proves the causal wiring without
claiming credentialed-model reliability or pedagogical optimality.

## Fresh executable evidence

All commands were run from their affected package, never from the repository
root.

### Core and migration

- `packages/core: bun run typecheck` — pass.
- `packages/core: bun run migration --check` — pass; no incremental drift and
  a complete migration-generated schema were produced in disposable paths.
- `packages/core: bun test test/learner-state-judgment.test.ts` — **17 passed /
  114 assertions**.
- `packages/core: bun test test/learner-response-evidence.test.ts` — **7 passed /
  194 assertions**, including a real Gate 19 version-zero source, persisted
  8-anchor/16-basis maximum, 9/17 atomic rejection, Session deletion, pinned
  stale truth, fresh source-unavailable truth, exact-history preservation, and
  zero-write reads.
- `packages/core: bun test test/database-migration.test.ts` — **47 passed / 476
  assertions**, including every frozen historical prefix and exact Gate
  20A-to-20B behavior/manifest parity.

### OpenCode released-v1 integration

- `packages/opencode: bun run typecheck` — pass.
- `packages/opencode: bun test test/learning-command/hooks.test.ts` — **5
  passed / 18 assertions**, including provider normalization of Gate 19
  version zero and the 8/16 versus 9/17 boundary.
- `packages/opencode: bun test test/learning-command/runtime.test.ts
  --test-name-pattern "learner-state"` — **6 passed / 40 assertions**.
- `packages/opencode: bun test test/learning-command/presentation.test.ts
  --test-name-pattern "learner-state judgment"` — **2 passed / 5 assertions**.
- `packages/opencode: bun test test/tool/registry.test.ts --test-name-pattern
  "fallible learner-state memory"` — **1 passed / 13 assertions**.
- `packages/opencode: bun test test/session/prompt.test.ts` — **29 passed / 360
  assertions**, including Gate 19, FutureAttention, Assignment, Gate 20B,
  interruption, no-output continuation, Task, and parent/child Turn traces in
  one file.
- `git diff --check` — exit 0; only the repository's Windows LF-to-CRLF notices
  were emitted.

One deliberately parallel diagnostic run placed the full database-migration,
Prompt, and hooks files under concurrent Bun/SQLite pressure. The historical
Gate 14-to-15 migration then failed once while dropping an old column and Bun
1.3.14 segfaulted. The exact old test passed alone, and the complete 47-test
migration file passed serially immediately afterward. This run is disclosed as
Windows Bun/native harness instability and is not used as Gate 20B semantic
evidence or hidden behind a retry.

## First implementation/evidence review and repair disposition

The retained reviewer's first implementation/evidence pass bound the prior
40-file / 4,553-byte candidate at SHA-256
`0C2FB71A151147FC09BCB276C5410CB369C17C1DD2E931980BB570396A284704`
and returned `Revise`. The retained reviewer independently re-read the repaired
candidate, reproduced the decisive version-zero/maximum/deletion and
released-v1 causal-consumer checks, and closed all four findings:

- `G20B-IE-001`: Gate 19's owner-native initial revision is version zero. Gate
  20B now admits only that producer arm as nonnegative while Goal, Assignment,
  and Gate 20B head versions remain positive. The provider decoder, Core
  grammar, structural seal, real owner admission, and persisted exact read all
  exercise version zero; wrong and missing references remain unavailable.
- `G20B-IE-002`: Gate 19 now exposes one owner-native exact-revision dependency
  view. It preserves the immutable cited revision while deriving the current
  head, subject/condition/cited-basis availability, and target relations for
  that exact revision in one transaction. Gate 20B fresh projection consumes
  this view; after source-Session deletion it reports source unavailable while
  exact history remains byte-equal and an old directory cursor is stale.
- `G20B-IE-003`: the released-v1 consumer uses a single request policy whose
  response predicates require the exact current directory and exact lazy-read
  result. Absent and wrong revisions do not select the teaching move; corrected
  Tool Part output and mutually exclusive old/new teaching are asserted. The
  zero-write path remains request-bound and leaves owner rows unchanged.
- `G20B-IE-004`: one real persisted boundary contains eight anchors and sixteen
  bases, including the Gate 19 version-zero reference. It proves child-row
  ordinals, first-bound identity, admission and durable byte ceilings, compact
  Context semantics without the body, exact/current lazy reads, and fresh
  dependency truth. Nine anchors and seventeen bases each fail before any
  physical or domain write.

## Corrective observations discovered during implementation

The implementation work exposed two adjacent but real causal defects and one
test-boundary defect. They were repaired at their owning boundary rather than
hidden by broader retries or false product rules.

### Shared-frontier time versus wall-clock time

Fresh Gate 20B current reads originally rejected a request whose supplied wall
clock was behind the monotonic shared frontier. Fresh current reads now use the
frontier time as their minimum trusted `asOf`; pinned directory/cursor reads
still require their exact old cut and return typed stale on drift. The owner
suite fixes this clock-regression case.

The same investigation found an older Gate 19 mismatch. Learner-response
evidence compared a frontier-clamped Assistant settlement against the raw
occurrence wall time even though the learner Turn Input had already been
causally admitted at the frontier floor. `currentSource` now uses that exact
Turn Input admission time, which matches the existing database constraint and
preserves source-order identity. The focused regression proves a completed
condition can precede a later learner source while the raw wall clock moves
backward; same-Turn, cross-Session, fabricated, and failed sources remain
rejected.

### Persistent test LearnerHome versus single-concern oracles

The two FutureAttention interruption/no-output Prompt tests previously used the
process-global Repa database. In the whole file, unrelated durable Course,
Interaction, Assignment, FutureAttention, and learner-state rows accumulated.
That turned a single-concern semantic test into an unowned load test and made
its assertion that one specific purpose must appear automatically false when
two legal due concerns required honest omission. The tests now use a disposable
independent LearnerHome, as their semantic premise requires. No production
priority, omission rule, timeout, or retry changed. The full Prompt file passes
with the original five-second event bound.

## Decisive counterexamples closed

| Counterexample | Required result in this candidate |
| --- | --- |
| The same source-bearing response supports a useful fuzzy judgment but not a mastery certificate. | Store one fallible whole-judgment revision with exact bases and non-implications; never compute a score. |
| A later learner says the definition itself is still unclear. | Append one exact-head successor; retain the prior revision and make a fresh Session teach differently. |
| Useful explanation finishes without a durable update. | Zero learner-state command/effect/revision/seal writes. |
| A delegated child is explicitly configured to allow the mutation. | Hide/reject the mutation before candidate, permission, or effect; optional read authority remains independent. |
| A crash occurs after candidate admission but before dispatch or commit. | Recovery terminalizes interruption and never applies the candidate blindly. |
| Two invocations race on one semantic address. | One effect/no-change owner wins; the loser reports already applied or conflict and can recover exactly. |
| A source owner changes at the same trusted millisecond. | A pinned directory/dependency cut either reproduces the old projection or returns typed stale; it never joins later state by time alone. |
| The cited Gate 19 evidence is its legal initial revision `0`. | Admit and persist that exact owner revision; keep Goal, Assignment, and judgment-head versions positive. |
| The cited evidence's source Session is later deleted. | Preserve both exact revisions, return stale for the old directory cut, and report source-unavailable truth on a fresh read without writing. |
| A provider response is queued independently of the observed revision. | The causal oracle fails: only an exact directory plus matching exact lazy-read result may select either teaching move. |
| The first accepted structural maximum or first overflow is exercised. | Persist and read 8 anchors / 16 bases; reject 9 or 17 atomically with no partial physical or domain state. |
| Ninety-six current Context anchors exist. | The bounded directory token preserves their exact fingerprints without embedding full producer records or exceeding its owner limit. |
| More relevant judgments exist than the automatic cut can carry. | Report exact count and candidate/byte omissions; keep detail discoverable through the directory-bound lazy read; never rank the first row pedagogically. |
| A provider has large tool definitions. | Keep every exact definition seal in the canonical cut while rendering only the aggregate v5 capability seal to the model. |
| Session deletion removes the authoring transcript. | Preserve the committed judgment/effect/receipt and minimum source tombstone; remove eligible no-effect command evidence and do not archive the transcript in the judgment. |
| The wall clock regresses behind the causal frontier. | Fresh reads and Gate 19 source ordering use the trusted causal floor; pinned old reads remain exact or stale. |

## Nonclaims and remaining qualification boundary

This candidate does not establish objective mastery, a scalar learner model,
automatic aggregation or decay, spaced repetition, review scheduling,
planning, priority, adherence, activity, task completion, pedagogical
optimality, external synchronization, background work, or release readiness.
It does not prove that every future owner can share the Gate 20B cursor or that
LearningContext should become a plugin framework. It reuses the current
operation-exact cut, typed tools, permission, settlement, recovery, and ordinary
Agent loop because those mechanisms already own the same computational
boundary.

The retained reviewer accepted the implementation/evidence layer against the
exact package manifest above. Gate 21 remains an unreviewed advisory-planning
contract candidate and receives no review or implementation authority from
Gate 20B acceptance.

## Independent acceptance and integration routing

The retained reviewer returned `Accept` for this layer, closed
`G20B-IE-001..004`, found no replacement finding, owner blocker, or contract
reopen condition, and left the production checkout unchanged. Gate 20B's
contract/theory and implementation/evidence layers are both accepted. The
reviewer is retired and must not be reused for Gate 21 or another Gate.

Local commit/push integration remains separately governed. The one parallel
Bun/native aggregate-harness failure and absence of credentialed-provider
qualification remain explicit later-release qualifications, not hidden Gate
20B claims.
