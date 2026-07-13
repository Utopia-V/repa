# One-time OpenCode fork and native Repa baseline

Status: Active implementation plan

Date: 2026-07-13

Decision: [ADR-0014](../decisions/0014-one-time-opencode-fork.md)

Evidence: [Fork provenance and gate ledger](../fork-ledger.md)

Legacy evidence: [Pre-fork Repa asset disposition audit](../research/pre-fork-repa-asset-audit-2026-07-13.md)

## Goal

Replace the current partial Repa-owned harness with one independent,
learning-native Repa product forked from OpenCode `v1.17.18`. The phase ends
when the inherited local Agent mechanics, one native Repa database, the first
learning authorities, material translation, and a scripted real-provider
learning trace work through one production runtime.

This is a substrate cutover, not another learning-state experiment. Existing
Repa behavior and tests are oracles; they are not compatibility APIs.

## Non-goals

- no OpenCode or old Repa data/config/plugin compatibility;
- no cloud, account, sharing, marketplace, or control-plane product work;
- no v1/v2 dual production runtime;
- no global rename before product behavior requires it;
- no new learner-evidence, Assignment, scheduler, ontology, or ALS-024 work;
- no human learner experiment;
- no provider matrix or speculative abstraction layer; and
- no compatibility wrapper around the current Repa runner or interaction
  schema.

## Accepted starting assumptions

- The production source begins from a full upstream history at OpenCode
  `v1.17.18`, not from the ignored `.reference` checkout.
- The fork preserves the MIT notice and records the upstream tag and commit.
- OpenCode's released v1 Session/provider/tool/TUI path is the sole initial
  production runner. Preview v2 is not wired into learning behavior.
- One physical SQLite database can contain several separate authorities.
- Existing local capabilities are retained unless a concrete incompatibility
  or maintenance cost justifies removal.
- A learning behavior is reduced to an inherited mechanism only when the
  behavior's identity, ownership, correction, and failure contract survive.

## Execution contract

The five phases below are requirement clusters, not five implementation
patches and not authorization to build the fork in one pass. Work advances
through one reversible evidence gate at a time in an isolated fork
worktree/branch. Passing a gate permits planning the next gate; it does not
pre-authorize the rest of the phase.

Before changing code for a gate, record a small gate contract that names:

- the one parent uncertainty or behavior being resolved;
- the native owner and inherited seam being exercised;
- explicit exclusions, including adjacent behavior deferred to a later gate;
- the positive path and boundary failures that must pass in the same change;
- the old executable oracle or accepted document that supplies expected
  meaning; and
- the exact rollback action if the evidence fails.

Each code-bearing gate ends with focused tests for the changed boundary, the
affected inherited tests, a diff audit against ADR-0014 and ADR-0012, and a
recorded result. A documentation-only correction instead verifies its diff,
links, status, and provenance; it does not trigger unrelated product tests.
Verification follows causal impact: reuse still-valid recorded results for
unchanged boundaries, rerun the owning checks for changed boundaries, and run
the full applicable suite once when actually declaring a phase boundary—not
after every checkpoint or documentation commit. Do not defer known exception
handling to a final hardening phase: the failure cases owned by a gate are part
of that gate's definition of done.

If a gate unexpectedly requires a second database, a compatibility bridge to
the old runner, changes across two still-unsettled learning authorities, or a
new reusable mechanism without a demonstrated consumer, keep the gate red and
return to research or split it. Do not widen the patch merely to preserve
momentum.

The pre-fork worktree remains unchanged and runnable as a black-box oracle
until cutover. Fork production code never imports it, shells out to it, writes
its database, or keeps it alive as a fallback. During pre-release development,
rollback means reverting the gate checkpoint and discarding that gate's fresh
Repa home/database; there is no backward migration contract for experimental
data.

## Minimum evidence gates

These are minimum separation points. A gate may be split further after
inspection, but two gates may not be collapsed merely because their happy
paths are easy to demonstrate.

| Gate | Bounded result | Required failure or rollback evidence |
| --- | --- | --- |
| 0. Pre-fork oracle freeze | Keep the current tree executable and classify production/tests/labs before porting. Completed on 2026-07-13 with `bun run check`: 244 passed, 0 failed. | Existing failures must be recorded before fork changes; never relabel them as fork regressions. See the asset audit. |
| 1. Lineage and provenance | Create the isolated full-history fork at the exact OpenCode `v1.17.18` tag/commit and preserve MIT provenance. Make no product edits. | A wrong/shallow ancestry, dirty imported source, or use of `.reference` fails the gate; discard the isolated worktree/branch. |
| 2. Pristine Windows baseline | Build and run the focused released-v1 checks before renaming or learning changes. | Record upstream failures without patching around their identity. If the released v1 path is not reproducible without preview v2, return to ADR-0014. |
| 3. Repa identity isolation | Change only binary/product identity and application-owned paths so a fresh Repa launch cannot read or write OpenCode state. [Passed 2026-07-13 at fork commit `0ffed9f62`.](../fork-ledger.md#closed-gate-sequence) | Exercise existing OpenCode homes, missing/unwritable paths, interrupted first launch, and database-name collision. Revert the identity checkpoint on failure. |
| 4. Learning-first composition boundary | Make every provider-selected interactive path implement the same Repa product contract and accept the same Learning-System composition inputs; provider-specific rendering remains allowed only for demonstrated requirements. Give compaction, summary, title, and other hidden calls narrow Repa-owned prompts for their actual task. Rework default agent/profile meaning, exploration, tool descriptions, plan reminders, and model-visible environment contributions where they assume coding is the product. | Deterministically enumerate every provider selector and hidden agent path. An ordinary learning request must no longer receive a coding-product identity on any interactive branch; compaction cannot turn learning continuity into a coding summary or PR description. This gate proves the composition boundary, not that a base prompt alone is the Tutor or that all learning authorities are already implemented. Explicit coding work may still use coding capabilities without changing the default ontology. |
| 5. Inherited product-surface disposition | Inventory commands, routes, agents, labels, configuration, and packages; retain, make explicit/optional, defer, or remove them by observable behavior. First prove excluded surfaces absent by unregistering their commands, routes, background entry points, and configuration; then delete implementation in dependency-closed subgates. No learning noun remapping occurs here. | Account/share/import-share/sync/control-plane and other excluded group surfaces are absent rather than visible-but-broken. `/init`, `/review`, todo, snapshot, undo/fork/compact, project/worktree, GitHub, and similar local surfaces stay red until their semantics cannot contradict learning authority. No dormant excluded implementation remains at final cutover, but physical deletion is not forced into the first surface-removal patch. |
| 6. Native database admission | Establish the Repa database identity, forward migration baseline, one-writer truth, and integrity checks before adding a learning command. | Reject old Repa, OpenCode, unknown, future, partially migrated, and corrupt files; inject migration failure; exercise abrupt writer death and a second writer. |
| 7. Interaction lifecycle mapping | Map learner occurrence, Turn, model operation, Tool Part, context cut, and terminal outcomes onto v1 records without changing terminal launch semantics yet. | Exercise repeated text, synthetic/compaction input, provider failure, cancellation, exhaustion, crash/reopen, and orphaned tool work without silent rerun. |
| 8. Sessionless terminal and continuation | Make the deterministic empty launch create no Session; the first ordinary input creates one; explicit continue/select resumes an existing transcript. | Exercise slash/control commands before input, invalid or missing resume targets, cancelled input, interrupted first admission, and reopen without synthetic learner occurrences. |
| 9. Root permission | Admit approved content roots with separate read and user-content write authority. Reuse the inherited permission flow before inventing policy code. | Exercise deny/allow-once/permanent/revoke, restart, moved or missing roots, case normalization, symlink/junction escape, narrow-subtree precedence, and unauthorized writes. |
| 10. Source observation | Add bounded deterministic inventory and exact revision-bound observation inside approved roots, without automatic semantic classification. | Exercise file mutation during observation, delete/move between inventory and read, unreadable/binary inputs, same-path new bytes, and fail-closed old selectors. |
| 11. Search scoping | Prove ordinary working-set search and visible bounded widening to one approved root through inherited ripgrep mechanics. | Exercise large/binary results, cancellation, empty or stale working sets, unapproved scope, and attempts at implicit all-LearnerHome or computer-wide search. |
| 12. Course context and focus | Prove lazy same-sample cross-Course context and separately confirmed durable Course switching. | Exercise stale switch confirmation, rejection/withdrawal, cwd changes, discovery and Agenda changes, and cross-Course reads without focus mutation or shadow focus records. |
| 13. Isolated atomic learning command | Select one accepted command and prove domain transition, receipt, physical invocation settlement, exact model result, and Interaction projection in one transaction. | Inject failure before the write and at every commit/projector boundary; exercise physical replay, semantic duplicate, conflicting reuse, stale source/entity/context, abort, and concurrent writer. |
| 14. Native loop integration | Drive that same command through the real v1 provider/tool continuation and restart path without a shadow executor. | Kill after commit but before model consumption, repeat the provider tool call, cancel mid-Turn, and reopen. Stored settlement must be returned without executing meaning twice. |
| 15. Representation acceptance | Record one source revision and one canonical readable representation through external conversion plus short atomic acceptance. Decline is a valid result. | Exercise missing converter, unsupported input, timeout/cancel, malformed/empty output, temporary-file residue, write/rename failure, and database failure after conversion. No accepted row may point at absent bytes. |
| 16. Representation drift and learner choice | Prove stale representation choice, retranslation, explicit export, deletion, external loss, and digest-based relink without retargeting history. | Exercise source change during/after conversion, old-revision reuse confirmation, same-digest relocation, different-content replacement, missing bytes, and repeated deletion/retranslation. |
| 17. Deterministic product trace | Run the fixed learning trace through one production entry point, including restart, fresh Session, compaction, cancellation, tool failure, and Windows terminal rendering. | Any unexplained identity, hidden retry, lost transcript, false terminal outcome, or second authority keeps the gate red. |
| 18. Real-provider integration | Run one bounded real-provider trace only after deterministic and fault gates pass. | Provider outage, malformed stream/tool result, cancellation, and budget/context exhaustion remain attributable. Provider success does not waive deterministic failures. |
| 19. Cutover and deletion | Port the remaining required learning behavior tests, then delete the old runner/schema and runtime-coupled lab harnesses from the product line. | Prove the fork no longer imports, invokes, dual-writes, or falls back to old code. The pre-fork history remains reachable as an oracle; reverting the cutover checkpoint restores the prior development line. |

Gate 1 passed. Gate 2 preserved the exact-tag Windows failure; its diagnosis
showed an invalid inherited PowerShell 5.1 test command rather than a runtime
streaming defect. Gate 2A then corrected only that test contract and passed.
Gate 3 then established independent Repa product and state identity at fork
commit `0ffed9f62`. Gate 4 established the protected learning-first composition
spine at `9c7b74f41` and completed truthful released-v1 profiles and hidden
operations at `17e25eab2`. Gate 5 is the next authorized engineering move.
Later gate contracts are refined from the evidence immediately before them
rather than guessed now from file names.

The first accepted product baseline is terminal-only. Inherited Web and Desktop
clients are deferred until real use justifies a separately accepted support
Gate. Gate 5 may therefore remove their public commands, proxy/build edges, and
release surfaces without treating that as a permanent rejection of future
clients. OpenCode Zen/Go receive no first-class provider integration in this
baseline; the generic custom-provider path remains available without Console,
marketing, anonymous-access, or upsell semantics. The inherited updater remains
absent until Repa owns a release, integrity, rollback, and migration contract.

## Legacy asset use during the gates

The existing production tree is useful in three different ways, detailed in
the asset audit:

- a few pure utilities are carry candidates, subject to an inherited-mechanism
  comparison and a current native consumer;
- Course, Agenda, Tutor context, source, and interaction tests are behavioral
  oracles whose contracts are re-expressed against native identities; and
- the old CLI, provider adapter, runner, database schema, and runtime-coupled
  labs remain black-box or historical evidence, not code dependencies.

Independent deterministic labs may remain runnable until their invariant is
covered natively. Labs coupled to `runTutorTurn` or the old database freeze at
the point their dependency changes; adding a compatibility adapter merely to
keep them green is forbidden. Frozen formal model packages remain historical
bytes and are never regenerated.

## Phase 1: establish a reproducible fork baseline

Create the fork in an isolated worktree or replacement branch so the current
Repa history remains available as an oracle until cutover. Obtain full
OpenCode history from upstream, verify the tag and commit, and record the
license provenance.

Before product changes, prove the pinned baseline on Windows:

```powershell
bun install --frozen-lockfile
bun run --cwd packages/core typecheck
bun run --cwd packages/opencode typecheck
bun run --cwd packages/opencode build --single --skip-install --skip-embed-web-ui
```

Run the focused database/event, v1 Session prompt/processor, permission,
cancellation, shell, and TUI tests that own later Repa changes. Record any
baseline failure before patching it; do not make a failed upstream build look
like a Repa regression.

Rename only product-owned surface required to isolate the application:

- binary and displayed product name;
- global data/config/cache/state paths;
- environment-variable prefix;
- database filename and application identity; and
- root package/release entry points needed for a reproducible Repa build.

Then replace the inherited coding-product default before adding learning-state
features. Audit every model-visible and hidden prompt path, not only the
fallback prompt: provider-selected base prompts, primary and hidden agents,
compaction, summaries, titles, exploration, tool descriptions, plan reminders,
command templates, instruction discovery, and environment contributions.
Every interactive provider path implements the same Repa product contract and
accepts the same Learning-System composition inputs; the exact rendering may
vary for demonstrated provider requirements. Hidden calls receive narrow
Repa-owned prompts for their actual task rather than the full interactive
context. This establishes a composition boundary, not a prompt persona that
pretends to be the whole Tutor. Provider-specific text cannot define a separate
coding identity for that provider.

Learning-first does not mean deleting useful coding mechanics. A learner may
still ask Repa to read or change code, use Git/LSP/patch/worktrees, or invoke an
explicit code-review capability. Those actions remain capabilities inside the
learning product. They do not make repository work the default ontology,
convert Session summaries into pull-request descriptions, or turn OpenCode
todo/review/project records into Agenda, Tutor review, Course, or LearnerHome.

Inventory the inherited local control commands by behavior. Retain those whose
Session, Interaction, permission, and committed-learning-effect semantics
survive; exclude cloud/share commands and repair or remove any undo, fork,
compact, or related action that can contradict a durable learning transition.
Do not invent Repa-specific Tutor slash commands during the baseline.

Audit excluded product modules separately from prompts. Account, share and
share-import, hosted GitHub action, sync/control-plane workspace, marketplace,
and comparable group surfaces must be absent from the Repa baseline along with
their routes, configuration, background work, and visible commands. A removed
feature is not left as a broken menu item or a dormant network call. Local
commands such as `/init` or `/review` are retained only as explicit scoped
capabilities when their unchanged names and effects remain truthful.

First remove excluded surfaces from registration and ordinary reachability and
prove their absence. Physically delete their implementations afterward in
small dependency-closed subgates. The final cutover ships no excluded dormant
modules, but the first surface-removal patch does not also rewrite every shared
dependency.

The phase passes when a pinned Windows `repa` binary opens a new Repa home and
database without reading or modifying OpenCode state; every interactive
provider selector implements the Repa product contract and composition inputs;
hidden calls use Repa-owned task-specific prompts; and excluded OpenCode
product surfaces are unreachable and absent from the ordinary interface. It
fails if the released v1 path cannot be built reproducibly, requires the
preview v2 runner, or still defaults to a coding agent under any provider
branch. Full Tutor behavior remains a later integrated-product gate rather
than a claim made by the base prompt.

## Phase 2: make Interaction and SQLite Repa-native

Choose one Interaction identity mapping over the inherited v1 Session,
message, part, and event projections. Preserve these meanings explicitly:

- admitted learner occurrence versus synthetic/compaction input;
- Turn terminal lifecycle;
- one model operation per provider sample;
- physical tool invocation and its exact model-visible settlement;
- immutable per-sample learning context cut; and
- interruption, exhaustion, failure, and reopen.

Add a Repa database identity marker and a forward-only Repa migration baseline.
Reject unknown, legacy OpenCode, old Repa, and future databases rather than
guessing from a shared table name.

Admit zero or more explicitly approved content roots and durable canonical
path-permission rules. Reading an approved root and editing user content remain
separate actions. Prove allow-once, reject, permanent allow across restart,
revocation, narrow-subtree precedence, path move/symlink handling, and the
unrestricted fixed Repa-owned artifact area through the inherited permission
prompt/evaluator flow.

Root approval may create only a bounded deterministic inventory. Do not launch
an automatic LLM-wide classification pass. Prove goal-driven selective reads,
an explicit budgeted broad organization action, drift discovery on wake/read,
and exact revision binding when content is actually observed. Bind ordinary
search first to the request/Course/material working set, then prove visible,
bounded widening to an approved root without a repeated prompt. An unapproved
root still prompts or denies, and no implicit search spans all LearnerHome roots
or the computer. Reuse the inherited ripgrep mechanics; admit no second search
authority or background semantic index.

Do not copy the current `session`, `session_item`, `model_operation`,
`tool_invocation`, `system_state`, or `durable_effect` tables into the new
database. Preserve their accepted behavioral examples and failure tests, then
implement those invariants through the native Interaction records. A narrow
Turn or context-cut table is allowed only when the inherited message/part
contract cannot represent its real consumer honestly.

The phase passes when one multi-step Turn survives restart with stable typed
items and no shadow lifecycle, interactive launch remains sessionless until the
first ordinary input, and explicit slash/CLI continue or select resumes the
intended transcript without first creating a Session. The deterministic empty
view is not mock prompt text or a synthetic learner item. Compaction or replay
may repeat old text but cannot manufacture a new learner occurrence;
interrupted model or tool work is never silently rerun.

Also prove that directory changes, discovery, Agenda state, and model output
cannot mutate the durable current Course. A Course switch commits only after an
explicit learner request and a second visible confirmation bound to the exact
target and current focus revision; rejection, withdrawal, and stale
confirmation leave the focus unchanged.

Verify separately that a learner request concerning another Course can load
that Course's bounded context in the same ordinary sample without changing the
durable default or creating a shadow temporary-focus record. The persisted
request and context cut must be sufficient to explain the cross-Course read.

## Phase 3: prove atomic learning commands in the inherited runtime

Introduce one already accepted local learning command through the native tool
path. Its purpose is to prove the transaction and identity seam, not to invent
a new domain concept.

Adapt EventV2/tool settlement so one SQLite transaction:

1. validates the current invocation, context cut, source, permission, and
   entity revision;
2. commits the domain transition and immutable domain receipt;
3. completes the same Tool Part with the exact model-visible result; and
4. commits the Interaction event/projection.

The result read back from SQLite is the result returned to the model. A later
AI SDK stream item confirms or reuses the stored settlement; it cannot execute
the command again.

Inject failures before the domain write, after each projector/commit boundary,
after database commit but before the model consumes the result, and during
restart. Verify exact invocation replay, semantic duplicate through a new
invocation, conflicting payload, stale source, abort, and second-writer
behavior.

The phase fails if any outcome permits a domain fact with a contradictory Tool
Part, a completed Tool Part without the domain fact, process-local identity
guessing, a second database, or a reconciler.

## Phase 4: admit general material translation

Use a real non-model-friendly local learning material. The input format is not
a durable product enum. At first need, a capability may use a mature converter
or model to offer a model-readable representation. The learner can decline
translation; absence of a derived representation is a valid outcome rather
than an error that the Agent silently retries around.

The native source/artifact authority records:

- original material identity, workspace-relative path, and exact revision;
- derived representation path, content revision, media type, and translator
  identity/revision;
- the exact original revision from which it was produced;
- the physical Tool Part and accepted-at time; and
- the selector/alignment used for bounded later reads.

External conversion completes before the short acceptance transaction. Output
is written to a temporary path inside the fixed Repa-owned artifact area and
atomically renamed; the database then accepts the canonical representation and
settles the tool. A crash may leave an unreferenced file, never a database
reference to missing bytes. Repa writes no derived sidecar into the learner's
content tree by default. An explicit export creates a separate user-owned
artifact and does not move canonical authority out of Repa's area.

The original remains available. A changed original makes the old
representation stale but does not rewrite or delete its historical meaning.
Reconversion is lazy. After drift, the learner may decline conversion, accept
a new representation, or confirm continued use of the existing representation
for the exact old-representation/new-source revision pair. That confirmation
does not claim that the old bytes represent the new source. Later Turns and
fresh Sessions can reuse whichever exact representation revision was selected
without automatic reconversion.

Accepted representation bytes are not automatically evicted. Exercise
learner-requested deletion, direct filesystem deletion, accidental loss,
same-digest relocation/relink, and different-content replacement. Preserve
the historical record and mark unavailable bytes explicitly; never retarget an
old selector or context cut to replacement content.

Do not hard-code one verification policy for uncertain conversion. Exercise
learner-visible choices to spend more model/tool budget, provide or correct
readable content manually, or proceed with explicit ambiguity. Preserve the
exact original and representation revisions used in the resulting context cut.

No PDF table, converter manager, format ontology, background pipeline, or
vector index is admitted by this phase. Translation derives a readable artifact
from one source revision; it does not perform corpus ingestion, chunking,
embedding retrieval, top-k prompt injection, or any other local-RAG role.

## Phase 5: scripted real-provider dogfood and cutover

Drive the real Repa provider/tool/Session loop with a fixed learner script. The
learner is not the maintainer and no claim about human learning quality is made.

The representative trace is:

```text
select a learning workspace containing non-model-friendly material
-> learner accepts translation on the first bounded read
-> Repa records the readable representation in its owned artifact area
-> Tutor explains or demonstrates from the exact representation revision
-> scripted learner sends a materially different follow-up
-> Tutor adapts through the same Session/runtime
-> one accepted learning command changes current context
-> process restart and fresh Session preserve relevant learning state
-> original transcript and source remain available lazily
```

Exercise cancellation, long-context pressure/compaction, tool failure,
restart, and terminal rendering through the same entry point. The trace must
show the exact Session, learner Turn, model operation, Tool Part, context cut,
source/representation revisions, domain transition, and terminal outcome.

After deterministic and fault-injection gates pass, run one bounded real
provider trace. Provider success is evidence of integration, not pedagogy.

Cut over only after the new trace passes. Then delete the old Repa generic
runner, old interaction/storage schema, dedicated compatibility tombstones,
and tests whose only purpose is the superseded API. Port learning-domain
behavior tests to the native runtime; do not preserve both implementations.

## Repository and documentation cutover

At cutover:

- ADR-0014 and this roadmap remain the active runtime authority;
- ADR-0001/0011 remain historical superseded decisions;
- current product and architecture documents describe the forked product, not
  a Repa layer over OpenCode;
- upstream provenance and MIT notices remain intact;
- `.reference` stays read-only and is not a production source directory; and
- the pre-fork Repa line remains reachable only as history/oracle, not as a
  compatibility branch shipped to users.

## Verification gate

Run the fork's inherited checks plus Repa-specific architecture, migration,
fault-injection, and vertical tests. At minimum verify:

- clean/future/interrupted migration behavior, `foreign_key_check`, and
  `integrity_check`;
- one LearnerHome writer and truthful recovery;
- multi-step typed Session history and compaction lineage;
- exact model-operation/context-cut/tool identities;
- atomic domain effect and Tool Part settlement;
- source and derived-representation drift;
- default working-set search, explicit approved-root widening, and denial of
  implicit LearnerHome/computer-wide search;
- declined translation, lazy regeneration, and confirmed stale-revision reuse;
- learner-selected cost/quality handling without a RAG index or hidden
  verification policy;
- explicit artifact deletion and externally missing-artifact recovery truth;
- same-Session and fresh-Session learning continuity;
- cancellation and failure truth;
- Windows binary and terminal behavior; and
- no imports from `.reference` or production dual runtime.

## Stop and rollback rules

- Stop if a gate's known failure cases are deferred as later cleanup while its
  happy path is declared complete.
- Stop if keeping an old test green requires a compatibility import, subprocess
  bridge, mirrored record, or second production executor.
- Stop if a patch crosses two unresolved authority boundaries without one
  executable invariant that requires both; split the gate and return to the
  parent uncertainty.
- Stop if a learning capability requires simultaneous production changes in
  both v1 and preview v2 runners.
- Stop if a second database, shadow lifecycle, compatibility wrapper, global
  event/fact table, or background reconciler appears.
- Stop if coding nouns are merely renamed to learning nouns without preserving
  the learning consumer's contract.
- Stop if upstream mechanics are rewritten before a failed reduction is
  demonstrated.
- Keep the existing Repa branch as the rollback oracle until the new fork
  passes the cutover gate; do not combine both runtimes to make partial
  progress appear complete.
