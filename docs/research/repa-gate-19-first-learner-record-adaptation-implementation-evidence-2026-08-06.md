# Gate 19 first learner-record adaptation implementation/evidence record

Status: **implementation/evidence repair candidate awaiting closure by the
retained independent reviewer.** The contract/theory layer remains accepted.
The first implementation/evidence pass received `Revise`; this record binds the
uncommitted repairs for `G19-IR-001..010` and their fresh evidence to the same
whole-Gate review run. It does not claim implementation acceptance, integration,
release, or authority for Gate 20 or any later Gate.

Date: 2026-08-06

## Exact authority and review binding

- implementation base: `8ababa1ee53cd0907056f33812621142538807dd`, with
  `HEAD`, `main`, and `origin/main` equal at implementation start and at this
  evidence pass;
- accepted Gate 19 semantic candidate SHA-256:
  `E3630BD59EAE438251EA09660FEF99127292E388B16CC5F25110DCA9AA9E79DF`;
- exact pre-contract collision result SHA-256:
  `7A8F7A64AE83BD402C858BC62410DEED484E3F383262B68B0B7E765D4B602A0D`;
- whole-Gate review run: `G19-WG-20260805-019fd20c-01`;
- executor task: `019fd20c-bc13-7eb2-9e7b-26cc428d3d9d`;
- retained independent reviewer task:
  `019fd269-e042-7423-85a9-bce7121f9b6e`;
- contract/theory disposition: **Accept**, with `G19-CR-001..005` closed and no
  material contract unknown or owner blocker;
- implementation/evidence disposition: **Revise**, with `G19-IR-001..010`
  repaired in the current candidate and awaiting reviewer closure; and
- production/test candidate manifest: **38 files / 4,538 canonical bytes**,
  SHA-256
  `29323F3D019C1F8115545374B4AFD8C9107C53E7FE64C875947495548329CF4A`.

The manifest contains every modified or untracked `packages/**` file and no
documentation or `AGENTS.md` file. Its canonical form sorts repository-relative
forward-slash paths ordinally and emits one
`path<TAB>actual-file-byte-length<TAB>uppercase-file-SHA-256<LF>` line per
file, encoded as UTF-8 without BOM and with a final LF. The manifest hash above
is the SHA-256 of those exact 4,538 bytes.

The accepted semantic hash identifies the contract before its post-verdict
status-only reconciliation. The current contract records that hash and the
reviewer's final decision; no accepted semantic term was changed. The working
tree also contains a maintainer-owned `AGENTS.md` change outside Gate 19. This
executor did not edit, revert, stage, or include it in the Gate 19 candidate
manifest.

No Git staging, commit, branch movement, merge, push, release, credential use,
paid call, or durable provider effect was performed. All provider evidence in
this record is local request compilation and capture only.

## Implemented production boundary

### One narrow Core authority, not a learner-state aggregate

Core now owns `LearnerResponseEvidence` as a separate native learning
authority. Its persisted meaning is exactly one current, correctable assessment
of one completed learner-response occurrence against the entire immutable byte
range of one exact Material Map selector and one exact Course/View/revision/item
membership. The semantic address is:

```text
subject occurrence
+ exact Map ID / selector ID
+ exact Course ID / View ID / revision ID / item ID
```

The neutral alignment is stored as admission provenance and checked against
those endpoints, but it is not part of the semantic address and does not become
an `assesses` relation. Two active alignment rows for identical endpoints reach
one semantic slot. A finer pedagogic claim requires a finer immutable selector;
there is no stored criterion prose or hidden subclaim key.

The module adds no universal learner record, attempt, activity, event, fact,
competency, skill, mastery, score, confidence, aggregation, decay, scheduler,
future-attention, planning, or recommended-action field. Ordinary explanations,
questions, reading, tool use, and ambiguous responses may legally create no
record and do not advance the shared frontier.

### Version 19 schema and immutable revision chain

Migration `20260806041450_gate19_learner_response_evidence` advances the native
database from V18 to V19. It adds six learner-evidence domain tables:

- `learner_response_evidence_disposition`;
- `learner_response_evidence_capability_issue`;
- `learner_response_evidence_capability_settlement`;
- `learner_response_evidence_record`;
- `learner_response_evidence_revision`; and
- `learner_response_evidence_commit_seal`.

The same migration adds one domain-neutral
`turn_model_source_retention` table. It says only which owner/reference needs
which exact completed model source retained; it contains no learner-evidence
relation, basis, or target meaning. The generic Turn deletion owner queries that
seam and has no import, table reference, or mutation path for the learner-
evidence authority.

The generated schema, checked-in `schema.json`, migration registry, V19 schema
extras, and strict trigger decoder share one generated definition. Fresh install
and frozen V18 upgrade produce the same current manifest. V19 creates no
learner-evidence row for historical data and does not rewrite a stored, decodable
Gate 18 v1 cut. V1 decoding uses the six-ID historical lazy-read catalog even
when a provider/custom tool used the later Gate 19 ID before it became reserved;
V2 alone uses the seven-ID current catalog. Frozen V16 and V17 paths now advance through V19; the manual
frozen-v12 and frozen-v13 current-parity fixtures explicitly include V19 rather
than stopping their handcrafted migration sequence at Gate 18.

Database constraints and V19 triggers enforce stable branded IDs, the exact
semantic-address uniqueness, one current revision, contiguous versions,
predecessor continuity, immutable endpoint/source identity, revision/commit-seal
symmetry, applied Gate 8 receipt linkage, and immutable committed history. They
also bind the authorized candidate's record ID, expected/effect version,
relation, exposure, full subject/target/condition provenance, command cause,
basis source, and terminal settlement to the rows actually committed.
Retraction can advance only the disposition while preserving the prior
assessment fields and basis source. Supported transitions, not arbitrary
out-of-band SQL, remain the semantic authority boundary.

The closed stored vocabulary is:

| Dimension | Stored values |
| --- | --- |
| relation | `supports`, `does_not_support` |
| exposure | `learner_response_before_tutor_disclosure`, `tutor_disclosure_before_learner_response` |
| basis | `tutor_interpretation`, `learner_report` |
| disposition | `active`, `retracted` |
| operation | `create`, `revise_from_tutor_interpretation`, `revise_from_learner_report`, `retract` |

`inconclusive`, `not_established`, criterion prose, scores, mastery, and a
caller-selected basis/disposition are rejected. Ambiguity remains absence, not
a durable uncertainty value.

### Program-owned operation, basis, and source matrix

The public write input exposes four disjoint variants and no generic payload
whose fields can be recombined:

| Operation | Runtime-bound assessment basis | Required readable assessment source | Legal effect |
| --- | --- | --- | --- |
| `create` | `tutor_interpretation` | current complete root learner response plus exact earlier/later completed Tutor condition in the same Session | create revision 0, active |
| `revise_from_tutor_interpretation` | `tutor_interpretation` | original subject response and condition remain exactly readable | replace relation/exposure, active |
| `revise_from_learner_report` | `learner_report` | current complete root learner input that explicitly causes this correction | replace relation/exposure, active |
| `retract` | preserved prior basis and basis source | current command cause only; no relabelling of the assessment | preserve assessment, set retracted |

The caller cannot provide a basis, basis occurrence, disposition, criterion,
assessment source, command-cause source, internal version other than the exact
expected record version, or an alternative semantic address. Program code
binds the current root/delegated Agent action, current response occurrence,
condition operation, current learner-report occurrence when applicable,
settlement time/order, and shared frontier.

`create` and Tutor reinterpretation fail before commit if their observation
sources are unavailable. A condition is admissible only when its completed
model operation belongs to the same Session, a different earlier learner Turn,
and its causal learner source order is strictly before the subject source order.
The stored clock must not run after subject admission, but an earlier causal
source may settle in the same millisecond; a post-response operation in the
subject Turn remains illegal. A post-deletion learner correction can create only a
`learner_report` revision and cannot masquerade as Tutor re-observation.
Retraction cannot rewrite relation, exposure, basis, or basis source. Both legal
revision variants can reactivate a retracted head only under their own source
rules.

### Exact Material/Course proof without assessment semantics in alignment

Material Map now issues an opaque `EvidenceTargetProof` for one active exact
alignment, current Map/selector, and immutable Course membership endpoint. The
proof records alignment/Map disposition versions and Course/View/revision
versions. Core revalidates it at settlement and rejects withdrawal,
supersession, endpoint mismatch, or state drift.

The ordinary host resolves the exact selector through the existing Gate 10/11/
13 current-use owner. A non-enumerable `CurrentUseReceipt` binds the exact
resolved bytes to settlement without putting bytes into command input, tool
output, database rows, permission metadata, or durable presentation. Empty or
greater-than-2,048-byte resolved selectors fail during host preparation before
the Gate 8 physical invocation or any learner-evidence/shared-frontier write. The
selector's entire immutable byte range is the only admitted assessment scope.

### Gate 8 physical settlement, policy, recovery, and presentation

`update_learner_response_evidence` uses the existing Gate 8/12 physical
invocation, candidate seal, FIFO tool frontier, capability policy, durable
permission issue/reply, receipt, failure settlement, semantic-first duplicate/
conflict, recovery, and immutable terminal Tool Part paths. The runtime
preserves root and delegated Agent-issuance provenance and intersects restricted
authority through one capability catalog entry and permission pattern
`learner_response_evidence`.

The same physical invocation replays its exact typed terminal result without a
second policy evaluation or effect. An identical semantic create through a
different active alignment returns `already_applied`; a different assessment at
the same address returns `semantic_conflict` and requires revision. A stale
expected version loses with no partial record. Focused evidence covers policy
allow/ask/deny, precommit interruption, source/current-use rejection,
preparation-time selector capacity rejection, exact replay, actual SQLite
reopen/startup recovery, and provider failure after a committed tool effect.
This record does not upgrade uncited failure classes into Gate 19-specific
evidence.

Schema v1 semantic presentation, the opencode presenter, TUI/direct-run/ACP
shared projection, and tool result metadata expose the runtime-bound subject
occurrence and exact Map/selector/Course target before approval, then the same
subject/target plus operation, relation, basis, exposure, disposition, version,
source policy, and durable settlement class afterward. Opaque record/revision
IDs are not used as substitutes for that scope. They explicitly identify the assessment as fallible
and selector-bound and do not render raw response, Tutor disclosure, selector
bytes, mastery, understanding, retention, or a required next move.

### Session deletion retains only exact source tombstones

Accepted Session-tree deletion still removes Session, Message, Part, transcript,
and presentation bodies. Gate 19 registers an exact condition model reference in
the domain-neutral retention seam; the generic Turn owner converts that source
to its existing body-free tombstone during deletion without knowing the
downstream learning authority. Learner occurrence tombstones already preserve
the subject/basis occurrence identity. Garbage collection protects those
tombstones while a generic retention owner exists and otherwise keeps the
existing final-owner collection rules. A successful source-availability change
also advances the shared frontier, so a preflight cut cannot commit across
deletion without retrying from a new snapshot.

Deletion validates that every cited condition was the exact completed model
operation and settled time recorded by the evidence owner. No response,
question, disclosure, criterion, material, prompt, or tool-result text is copied
into the tombstone or evidence tables. Owner reads distinguish `available`,
`source_deleted`, `presentation_unavailable`, current, withdrawn, superseded,
and unavailable targets without retargeting to a latest/similar source.

An aggregate Turn-suite attempt passed 27 cases before a Bun 1.3.14 native
segmentation fault; each of the remaining five cases passed in a fresh isolated
process. This is coverage of all 32 cases without a false one-process-green
claim.

### Bounded owner reads and Gate 18 v2 context

The new `learner_response_evidence_read` tool exposes four pure query variants:
exact record, exact record history, exact selector, or exact Course membership.
Pages are deterministically ordered, cursor-bound, limited to 64 items and
32 KiB canonical bytes, and report `countAtRead`, byte use, and truncation
truth. Current and historical revisions preserve separate command-cause and
assessment-basis sources. The tool returns locators and assessment metadata,
never Interaction or Material bodies, and does not advance the frontier.

Gate 18 remains the context owner. Policy/renderer version 2 adds a sixth
`learner_response_evidence` section while continuing to decode immutable v1
five-owner cuts. Before one new model admission, SessionPrompt asks Core for
only Map/selector requirements reached from the structurally included Course
memberships, resolves those selectors through the non-observing Tutor
current-use owner, then gives Core opaque current-use receipts. Core includes a
head automatically only when all of these are true:

- the head is active and its exact Course membership is structurally included;
- subject response, Tutor condition, and any distinct current learner-report
  basis source are all exactly `source_deleted`;
- the recorded Map, selector, alignment, Course, View, revision, and item still
  prove the exact current target;
- the selector remains current-use readable and is at most 2,048 bytes; and
- automatic context is authorized for this operation.

Any readable assessment source disqualifies automatic pressure, including a
readable learner correction. Retracted, withdrawn, superseded, drifted,
unavailable, unproved, and source-readable heads remain absent. Owner reads may
still show their exact current truth.

The local projector counts all qualifying heads in deterministic subject-source
order, retains at most eight, and reports exact candidate omission. Gate 18 may
then omit additional evidence entries under its existing global byte budget;
the two omission reasons compose rather than hide each other. The 65-head test
proves `0`, `1`, `8`, `9`, and `65` local counts, deterministic first-eight
selection, full 65-head paginated owner recovery, and a real Gate 18 cut whose
`57` candidate-limit omissions plus `7` global-byte omissions leave one exact
entry. No source/material body appears in the cut.

Corrections and retractions never alter an admitted cut. A newly admitted model
operation recomputes source eligibility and current head; retry reuses the
stored immutable cut through the existing Gate 18 path. Internal title,
compaction, representation, and other non-interactive operations remain outside
the interactive learning-context composition.

## Contract decision and evidence mapping

| Contract decision | Implemented owner | Decisive evidence |
| --- | --- | --- |
| `G19-OPEN-001`, `G19-COLLISION-001`, `G19-EXPERIMENT-001` | exact pre-contract result plus source deletion behavior | fixed S/N/D literals/hashes and owner projection; Core readable/deleted-source controls; deterministic provider ablation |
| `G19-MEANING-001` | strict command/schema vocabulary and selector-bound record | decoder negatives, constraint negatives, duplicate-alignment single-slot oracle, no-body scans |
| `G19-SOURCE-001` | immutable source locators, opaque Material/Course proof, separate command cause and basis source | create/current-source checks, deleted-source projection, learner-report correction, current-use and withdrawal negatives |
| `G19-REVISION-001` | one append-only current head and four-operation transition matrix | create/Tutor revision/learner-report revision/retract/reactivation history, stale and malformed negatives |
| `G19-COMMAND-001` | Gate 8/12 runtime, policy, recovery, presentation | root/delegated, allow/ask/deny, replay, capacity, typed result and registry tests |
| `G19-CONTEXT-001` | Gate 18 v2 sixth owner plus v1 decoder | source-readable exclusion, deletion eligibility, 0/1/8/9/65 projection, real v2 render and provider compilation |
| `G19-FAIL-001` | V19 constraints, atomic settlement, Session deletion tombstones | fresh/frozen upgrade, rollback and no-partial-state negatives, 32 retained Turn lifecycle regressions |
| `G19-OWNERSHIP-001` | Core domain authority; thin opencode tools/runtime; domain-neutral provider | dependency direction, registry publication, no provider-specific production code |
| `G19-NONIMPLICATION-001` | fixed context/presentation non-implications and absent fields | strict vocabulary scan, rendered labels, no raw bodies, no production move selector |
| `G19-EVIDENCE-001` | focused deterministic suite and this result record | commands and exact results below |

## Deterministic causal evidence

### Domain, transition, deletion, correction, and scale

The six Gate 19 Core cases were run in separate Bun processes with exact
`--test-name-pattern` selectors. Result: **6 pass / 122 assertions**:

| Case | Assertions | Decisive claim |
| --- | ---: | --- |
| closed command vocabulary | 11 | uncertainty, caller basis/disposition, criterion prose, caller-selected historical/Assistant/tool subject locators, caller-selected report source, and retraction assessment fields are rejected |
| causal condition order | 14 | an earlier causal source remains legal at an equal millisecond; equal/later causal source order, same-response Turn, cross-Session, fabricated, and failed model sources produce no Gate 19 write |
| raw SQL candidate/effect binding | 6 | otherwise-valid cross-record retraction and opposite-relation revision inserts roll back at the V19 authority |
| stateful zero-write teaching | 2 | explanation, content read, ordinary question, same-Session adaptation, ordinary read-tool success, and Turn completion leave all six domain tables, generic retention, and the shared frontier byte-for-byte unchanged |
| state/deletion/correction | 57 | real create/replay/duplicate/conflict/retract/revise/reactivate paths, deletion truth, exact source/target availability, current-use ablation, immutable old cut, bounded pure owner reads, duplicate-title Course state, and no retarget |
| 65-head scale | 32 | exact `0/1/8/9/65` counts, stable first-eight choice, honest local/global omission, and complete cursor/byte-bounded recovery |

The causal-order case also commits its equal-millisecond positive through the
SQL trigger, so this is not merely a TypeScript preflight assertion. The main
case checks the generic model-source-retention row and its body-free tombstone,
withdraws/restores the alignment, withdraws the originally recorded Course
revision after creating a duplicate-title View, and proves the immutable target
becomes unavailable rather than retargeting.

A current aggregate invocation passed the first five cases and then the Bun
1.3.14 process segfaulted before the scale case reported. The unchanged scale
case passes in a fresh process. Therefore the six semantic cases are individually
green; this record does **not** call the one-process file run green.

### Migration and Gate 18 compatibility

From `packages/core`:

```powershell
bun run migration --check
bun test test/database-migration.test.ts --test-name-pattern "upgrades a frozen Gate 16 database through Gate 19"
bun test test/database-migration.test.ts --test-name-pattern "upgrades a frozen Gate 17 database through Gate 19"
bun test test/database-migration.test.ts --test-name-pattern "upgrades a frozen Gate 18 database without rewriting"
bun test test/database-migration.test.ts --test-name-pattern "upgrades the frozen v12 schema through v13"
bun test test/database-migration.test.ts --test-name-pattern "upgrades frozen v13 Default-Course rows"
```

Results:

- migration generation parity: **pass**; incremental generation reports no
  untracked schema change and full generation succeeds;
- frozen Gate 16/17/18 upgrades: **3 pass / 38 assertions**;
- frozen v12 current structural parity: **1 pass / 6 assertions**; and
- frozen v13 current structural parity/history preservation:
  **1 pass / 11 assertions**.

The Gate 18 fixture includes a provider definition named
`learner_response_evidence_read` while its historical v1 lazy list correctly
omits that then-unreserved ID. Upgrade and current decoding retain the exact v1
canonical/rendered bytes and use the six-ID v1 catalog; V19 tables/triggers
appear empty and foreign-key clean. The older current-parity
fixtures initially exposed a stale test sequence that stopped at Gate 18; V19
was added to those explicit handcrafted sequences, and both decisive paths now
pass independently.

The full 44-test migration file is deliberately **not claimed green** on this
Windows/Bun 1.3.14 process. Aggregate attempts triggered Bun native large-heap/
segmentation faults, one temporary-directory `EBUSY`, and—after several large
fixtures accumulated in the same process—a failure preparing the pre-existing
1,198-parameter timezone insert. The serial aggregate was useful because it
first exposed the two stale v12/v13 sequences above; those causal failures were
repaired and their isolated tests pass. The remaining native aggregate failures
are retained as harness observations, not converted into Gate 19 semantic
evidence or hidden behind a passing claim. Gate 19 remains one unintegrated V19
migration; no repair-only follow-up migration was retained.

### Existing Gate 18 and Turn regression boundary

From `packages/core`:

```powershell
bun test test/learning-context.test.ts --timeout 120000
bun test test/turn.test.ts --timeout 120000
```

Results:

- Gate 18 cut/capacity integrity: **11 pass / 37 assertions**; and
- Turn lifecycle, deletion, recovery, Gate 15 steering, and context atomicity:
  the aggregate process passed **27** cases before a native segfault; the
  remaining **5 pass / 59 assertions** in separate fresh processes.

The only stale Gate 18 assertion was the withheld-cut owner count. It now
asserts the exact six-owner order and verifies every owner, including learner
response evidence, remains `not_authorized`, unknown-count, and empty when
automatic context is withheld.

The Turn aggregate result is deliberately not represented as `32 pass` in one
process. All 32 named cases produced passing assertions across that aggregate
prefix plus the five isolated runs. A static ownership check also returns no
`LearnerResponseEvidence` symbol or `learner_response_evidence` table reference
from `packages/core/src/turn/turn.ts`; Turn depends only on the generic
`TurnModelSourceRetentionTable` seam.

### Ordinary runtime, policy, tool surface, and presentation

From `packages/opencode`:

```powershell
bun test test/learning-command/runtime.test.ts --test-name-pattern "runs learner-response evidence through root/delegated policy"
bun test test/learning-command/presentation.test.ts
bun test test/tool/registry.test.ts --test-name-pattern <each of the four Gate-19-bearing registry cases>
```

Results:

- real Core/opencode runtime chain: **1 pass / 35 assertions**;
- semantic presentation: **9 pass / 77 assertions**; and
- Gate-19-bearing registry composition: **4 pass / 130 assertions** in
  separate fresh processes.

The runtime trace first uses the ordinary `update_learning_course` path to
create the Course, local Artifact, exact byte-range selector, over-wide whole
target selector, and neutral alignments. It then executes a root `create`,
exact physical replay under a later deny context, delegated `retract`, prompted
Tutor reinterpretation, policy deny, rejection of a delegated learner-report
revision, a greater-than-2,048-byte current-use failure before any physical or
domain write, a caller-basis decoder failure, precommit interruption, and an
admitted-candidate restart. The test closes and reopens the same SQLite file,
proves the prior committed Tool Part survives, startup recovery terminalizes the
orphan exactly once, and replay adds no revision. It verifies root/delegated
issuance, allow/ask/deny outcomes, typed terminal presentation, and no copied
response/material body.

Registry tests prove both read and write capabilities reserve their stable IDs,
publish through the default ordinary tool set, preserve host preparation, and
remain independently restrictable/delegable. Presentation tests prove two
otherwise-identical proposals with distinct subjects render distinct approval
facts, and the applied result renders the exact subject plus exact
Map/selector/Course target. The Gate 19 case also rejects forged basis metadata
and makes no mastery claim. It does **not** claim every terminal class.

A full registry-file attempt segfaulted natively before any test result. The
four relevant cases subsequently passed independently; unrelated registry cases
are not counted as fresh Gate 19 evidence here.

### State-to-context-to-provider wiring and zero-write peer teaching

From `packages/opencode`:

```powershell
bun test test/session/llm-request.test.ts
bun test test/session/prompt.test.ts --test-name-pattern "FIFO steers bind distinct model operations and retry across a Session-deletion frontier"
bun test test/session/prompt.test.ts --test-name-pattern "joins stored deleted learner evidence through SessionPrompt"
```

Results:

- request composition/provider compilation: **18 pass / 130 assertions**; and
- real deletion/frontier interleaving: **1 pass / 18 assertions**; and
- stored-state-to-provider S/N/D trace: **1 pass / 31 assertions**.

The Gate 19 request test fixes the accepted 288-byte later request and verifies
its SHA-256
`1b19637374085117ae91e3ae7542f9fb961a089c93e9b8457e8611f2fee41e2d`.
For S, N, and D the request-composition test constructs a complete valid Gate 18 v2 cut with the exact
six-owner order, current capability catalog, bound provider tool surface,
canonical fingerprint, converged canonical/rendered byte counts, rendered
fingerprint, and one selector-bound evidence entry. Production
`LearningContext.renderCut` validates each cut before use.

The ordinary OpenAI Responses path and retained OpenAI OAuth instructions path
then compile those exact protected blocks to provider-visible request bodies
without opening a network connection. Each body contains the protected block
and later request exactly once and contains none of the fixed response or Tutor
disclosure bodies. A test-only, fixture-specific oracle reads only the provider-
visible relation/exposure pair and returns:

| Fixture | Test-only branch |
| --- | --- |
| S: supports + response before disclosure | `application_question_only` |
| N: does not support + response before disclosure | `correction_only` |
| D: supports + disclosure before response | `new_answer_hidden_check_only` |

Removing only the evidence entry makes all three interpretations return
`underdetermined_without_record`. This is causal carrier/wiring evidence only.
No production code contains this oracle, no model generated a branch, and the
test does not claim representative ordinary-Agent interpretation, reliability,
pedagogic quality, or Gate 21A move selection.

The separate production-path trace removes the hand-built-input proof gap. It
creates a real ContentRoot, Artifact, Course/View/item, Material Map, exact byte
selector, and neutral alignment through the ordinary command path; commits a
real `supports / response-before-disclosure` record; observes a deliberately
failed next provider operation after the tool commit while the typed effect
remains durable; deletes the source Session; and proves the deletion frontier
changes requirements from empty to the exact Map/selector. A later ordinary
SessionPrompt admission resolves that exact material, commits the immutable
Gate 18 cut, and sends the protected `S` entry to the captured provider request.

Two legal root learner-report corrections then drive the same production join
through `N` (`does_not_support / response-before-disclosure`) and `D`
(`supports / disclosure-before-response`). While each correction source is
readable, automatic pressure is absent; after its Session deletion, the next
new admission sends the corrected protected entry. The test-only oracle returns
`application_question_only`, `correction_only`, and
`new_answer_hidden_check_only` from those three captured production requests.
The old `S` cut stays immutable, an exact replay after correction reuses it
without a provider hit, and newly admitted cuts recompute from the current head.
No production move selector is introduced.

A separate zero-record trace uses the same valid v2 cut with an empty learner-
evidence section and no write tool. Only ordinary same-Session message history
changes. The test-only peer oracle changes from
`contrast_correction_then_retry` for expressed continuing confusion to
`application_question_only` after the learner says the distinction is clear.
Together with the stateful Core six-table/frontier snapshot, this proves that a
useful teaching adaptation can remain zero-write; it is not a production Tutor
policy.

The deletion-interleaving test performs an actual Session removal between
preflight and model admission. Because deletion advances the shared frontier,
the stale attempt retries, recomputes material requirements, and commits one
coherent cut rather than surfacing `ContextProofRequiredError` as an integrity
failure. Gate 18 retains fresh/resumed/fork/child/steer/tool-continuation/
post-compaction applicability; Gate 19 adds one validated owner section and no
second carrier or runtime.

### Static and generated consistency

From the affected packages:

```powershell
cd packages/schema; bun run typecheck
cd packages/core; bun run typecheck
cd packages/opencode; bun run typecheck
git diff --check
```

All three package typechecks pass. `git diff --check` reports no whitespace
error. The checkout remains on the exact base with no tracked Git operation;
line-ending notices are existing Windows autocrlf warnings, not content errors.

No aggregate test/assertion total is claimed: the decisive commands have
different isolation boundaries, and adding their counts would obscure the
failed one-process attempts. “Deterministic” in this record describes the
semantic fixture and oracle. It does not claim reliable one-shot execution from
Bun 1.3.14 on this Windows host. Fresh runs observed native segmentation faults
after passing assertions in the learner-evidence and Turn files, a pre-result
registry segfault, first-attempt pre-result aborts in two focused frozen-migration
runs, and the previously disclosed migration-generation abort/`EBUSY` behavior.
Fresh focused reruns produced no semantic assertion failure after
the causal-order repair; the runtime cause and frequency remain unknown.

## Implementation/evidence review repair delta

The first implementation/evidence review returned `Revise`. The current
candidate answers each acceptance-changing finding without reopening the
accepted contract:

| Finding | Repair and decisive evidence |
| --- | --- |
| `G19-IR-001` | version-specific lazy-read catalogs; frozen v1 fixture with a colliding pre-reservation provider tool ID and unchanged v1 cut bytes |
| `G19-IR-002` | durable condition causal-source-order comparison plus same-Session/different-Turn and non-running-clock checks; equal-millisecond earlier-source positive and same-response/cross/fabricated/failed negatives; production race repeated green |
| `G19-IR-003` | V19 triggers bind candidate record/effect/version, full subject/target/condition provenance, relation/exposure, basis source, command cause, receipt/frontier, and terminal; raw cross-record/opposite-assessment transactions roll back |
| `G19-IR-004` | generic `turn_model_source_retention` seam; Turn has no learner-evidence dependency, while real Session deletion preserves only the exact body-free condition tombstone |
| `G19-IR-005` | proposal and terminal schemas carry/render runtime-bound subject and exact target; distinct-subject approval and applied-result tests, with opaque IDs explicitly non-semantic |
| `G19-IR-006` | Session deletion advances the shared frontier; an actual preflight/deletion/admission interleaving retries and recomputes instead of committing a stale proof |
| `G19-IR-007` | current-use resolution carries selector byte length and rejects empty/over-2,048-byte targets before physical invocation; the full physical/domain/retention/frontier snapshot remains unchanged |
| `G19-IR-008` | stateful zero-write database trace plus real stored/deleted/corrected state through requirements, material resolution, immutable cut, replay/new admission, and captured S/N/D provider requests |
| `G19-IR-009` | precommit interrupt/replay, actual SQLite reopen/startup recovery, provider failure after commit, strict rejection of caller-selected historical/Assistant/tool/report sources, causal condition negatives, delegated child-report rejection, exact target withdrawal/duplicate-title no-retarget, and bounded read-purity evidence |
| `G19-IR-010` | this record now names only the four implemented read variants, the terminal/presentation cases actually tested, the fragmented native-run truth, and the production-path evidence actually present |

## Fixed non-implications and remaining review boundary

This implementation does not establish:

- a write after each teaching or learning activity;
- a deterministic grader, keyword matcher, extra grading model, background
  classifier, or automatic transcript promotion;
- a durable `inconclusive` state or unsupported mastery/understanding loop;
- a universal learner record, activity log, competency graph, ALS schema port,
  score, confidence, aggregation, decay, review schedule, or future attention;
- a copied learner response, Tutor disclosure, selector body, criterion prose,
  prompt, or tool result;
- a general help/hint/pedagogy taxonomy;
- a production action selector, representative move quality, model reliability,
  educational efficacy, or product-loop closure;
- a Gate 20 attention owner, Gate 21 planner, Gate 21A move-selection policy,
  Gate 22 complete inspection UI, Gate 23 closed loop, or release readiness; or
- a credentialed/provider qualification. No credential or provider endpoint was
  opened by Gate 19 evidence.

The implementation/evidence reviewer should reject or revise the candidate if:

1. any legal decoder/domain/SQL transition can relabel a learner report as
   Tutor observation, create revision-0 learner report, or rewrite assessment
   fields during retraction;
2. neutral alignment or mutable prose has regained criterion/effect identity;
3. Session deletion preserves a body, loses an assessment-bearing tombstone, or
   allows a deleted source to be reported as readable;
4. a source-readable, retracted, withdrawn, drifted, unavailable, or
   structurally unrelated head can exert automatic pressure;
5. a current qualifying head can retarget to latest/similar Material or Course
   state, or a stale current-use proof can commit;
6. physical replay, semantic duplicate/conflict, correction races, recovery, or
   presentation failure can duplicate, partially apply, or misstate an effect;
7. owner-read/context bounds hide count or omission truth, leak source bodies,
   or mutate state; or
8. the deterministic provider trace is being used to claim ordinary-Agent move
   quality rather than only causal state-to-request wiring.

No maintainer-owned product choice or expensive external boundary is known at
this candidate. A valid implementation finding should be repaired in this
executor context and returned to the same reviewer. If review shows that the
exact selector slot or report/observation strength cannot be preserved without
a new general criterion or pedagogic authority, the contract must reopen rather
than expanding Gate 19 silently.
