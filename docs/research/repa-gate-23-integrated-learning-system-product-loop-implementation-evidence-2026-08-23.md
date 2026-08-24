# Gate 23 integrated Learning-System product loop — implementation/evidence

Status: **implementation/evidence accepted; `G23-IR-001..003` closed;
contract/theory and implementation/evidence both accepted; Whole Gate
accepted; published on `origin/main` through prototype-version commit
`3517b2044e70`; not released**

Date: 2026-08-23; repair cut 2026-08-24

This record binds the implementation/evidence candidate derived from the
independently accepted
[Gate 23 contract](./repa-gate-23-integrated-learning-system-product-loop-2026-08-23.md).
It is not product or architecture authority. [`docs/README.md`](../README.md)
remains the sole current-status owner, and [the fork ledger](../fork-ledger.md)
owns exact review, recovery, and evidence provenance.

Whole-Gate run `G23-WG-20260823-5F9B9860-01` used top-level reviewer
`01a02d7f-8926-7562-82c3-06d2fadb1143`. Its contract closure first accepted
only the contract/theory layer, closing `G23-CR-001..003` against the exact 36,588-byte
semantic candidate
`CDFE23F708DCCF3C5327EEDED6B1436BB2FA84CFB3B32801B0C0122E37512D1F`.
The reviewer's first implementation/evidence pass returned `Revise` for three
High findings: a legal equal-time predecessor was rejected, selected provider
phases could not be independently rebound across an unretained runner
mutation, and the real-provider runner entered `SessionPrompt` below the
contract-required retained carrier/handler boundary. The repair candidate
below addressed all three. The closure pass retested their original acceptance
impacts, closed `G23-IR-001..003`, opened no replacement or new finding, and
returned `Accept` for implementation/evidence and the Whole Gate. Integration,
release, provider reliability, pedagogy, and educational efficacy remain
unaccepted and separately governed.

## Candidate identity

- derivation base and unchanged `HEAD`/`origin/main`:
  `e2bcaa62a2b7f475528ad3c37e230bc8062d1270`;
- accepted Windows working-tree implementation/test/runner package:
  **16 paths / 1,243,728 bytes**;
- canonical working-tree package manifest:
  `243538E5280C8E0937C53BD3F2855CCB7D3CFB2D3FA82A79539D637EE5E4B572`;
- local implementation commit:
  `db3ae0c80068a4f574de687edca18075fbdc1bc8`;
- behavior-equivalent commit-tree package: **16 paths / 1,230,882 bytes** at
  canonical manifest
  `CABB42A293E0C4EB74AD6976E45067739DDC5FACE46DC0DE241B2A9BABCCE024`;
- the only working-tree/commit-tree difference is CRLF-to-LF normalization in
  six files / 12,846 removed carriage-return bytes; normalized bytes match all
  16 commit blobs with zero non-EOL difference;
- database migration generation remains 34; no migration or durable owner was
  added;
- documentation is a post-run derived artifact and is not included in the
  16-path implementation package.

The canonical manifest uses sorted
`path<TAB>byte-length<TAB>UPPERCASE-file-SHA-256` records joined by LF with no
terminal LF:

```text
packages/core/src/learning-inspection-cursor-schema.ts	8567	D520E71211FD1FDA1861D42C998098CEDC463D34574E791237628C5907E5C7AA
packages/opencode/script/gate23-real-model.ts	148156	E63F903FA64D0D78D10A026DEB989F46F331EEBACB580B83908BC435E4D7CE68
packages/opencode/src/learning-command/input.ts	58411	83DBDCACD2D288FB945E8A101DA82F748CCFBF60D36F6A8A9E69CF95F1F0DA83
packages/opencode/src/learning-command/runtime.ts	323188	DA77AA0F56C06566C01091DC91B16BEACAE0CD4681F8CEA2BAC9002CF534D830
packages/opencode/src/session/processor.ts	73565	5ABDD594C01BDDF5F756A46F65CAF4795B9A0B45ABAE0387168788707A1D4E23
packages/opencode/src/session/tools.ts	30807	75B3CA810622C7ACAC8E9B0BE0AA1CC469C8945240EA1278FA9B941ED6A35664
packages/opencode/src/tool/learner-state-correction.ts	10062	CB92E6B567EB439279EA60A8BF57660F6A78DA6F3F9C77D639F639E108B440E7
packages/opencode/src/tool/learner-state-judgment-read.ts	7868	30CAAC345401B80448B540BA8D63BAE85D9B2B1042B0FF0410D57BE810BE16A3
packages/opencode/src/tool/learning-command.ts	4513	1ECE50A6A5DCD4B4F551E7CBB2663EA70F01F87BA84B5FE43295D03407051C6D
packages/opencode/src/tool/learning-interaction-read.ts	31068	7290B7CE520D87B5EDD0691D1808C46A367BDC4F71A540EFF173D46A049669F5
packages/opencode/src/tool/learning-interaction-search.ts	11875	74AFFA2A8F0286DBE0F65DC5B03321F74391CE493005208315AAB5B12F277756
packages/opencode/src/tool/registry.ts	28479	DB1D8332316397E52C2FE8C814CD188E7B9E9C6DEF86C3C0D74A0DA0D451D9A6
packages/opencode/src/tool/update-learner-state-judgment.ts	4714	D7B3795E85442E8B108F5C2A8773AFEBD0F308F9A067F29028E7B4CC7DDD1275
packages/opencode/test/session/prompt.test.ts	401243	4872C5BEF88EFD4D16B9D03E10DB0247A1DC3BEFD33CD321D4D3D73576ADDB38
packages/opencode/test/tool/learning-interaction-range.test.ts	16298	FE86B04A155B249CC2394C6EE2B3E0ED13621E983FD64BF09015A7DE3913829F
packages/opencode/test/tool/registry.test.ts	84914	56BC761634F2B30507A15EEA9BF422E0BAC1C44F210B6E8ADBE6D5FADA7448F8
```

## Production repairs exposed by admitted traces

The deterministic predecessor initially added evidence only. Bounded
`openai/gpt-5.6-luna` execution then exposed two real producer/consumer seams.
Both repairs remain inside the released-v1 Session/Turn/Context/tool-terminal
spine and the existing owner commands.

### Compact exact recent-Interaction handoff

The original `list_recent` result exposed a complete immutable Interaction
locator. That was safe, but an ordinary model had to reproduce several 64-hex
fingerprints in a later `read_range` call. Multiple correctly rejected copies
showed that the interface made a normal continuation unnecessarily brittle.

The existing `learning_interaction_read` tool now supports
`read_recent_range`:

1. `list_recent` emits its exact completed call identity and a zero-based
   index on each returned entry;
2. the model returns only `directoryCallID` plus `entryIndex`;
3. the program proves the current admitted model/tool identity and one unique,
   earlier, admitted and completed `list_recent` invocation in the same
   Session/Turn/Input;
4. it reads the immutable stored predecessor output, verifies the handle and
   indexed full locator, and invokes the unchanged exact range reader; and
5. the compact action always uses the existing 64-item bound. Consumers that
   actually need pagination retain the signed full `read_range` continuation.

Wrong Input, call, action, index, Part identity, duplicate or deleted
predecessor, malformed locator, range rewind, erased gap, and reset remain
fail-closed. The model never becomes the source of locator truth. No second
Interaction tool, owner, runtime, or fallback was introduced.

### Compact learner-state correction handoff

The real intermittent-use trace repeatedly showed the model either nesting the
strict full learner-state schema incorrectly or copying one long Course anchor
ID with changed case. A shorter correction input was therefore admitted only
after one exact current owner read:

1. a successful `learner_state_judgment_read/current` result exposes
   `correctionHandle.currentReadCallID`;
2. `revise_from_current_read` carries that handle, one unique exact excerpt
   from the current learner message, the revised judgment body, uncertainty,
   and rationale;
3. the program proves one earlier completed current read in a terminal Turn of
   the same Session, including exact Turn/Input/model/candidate/invocation/Part
   identity and the stored handle; terminal time may equal the admitted time of
   the current running Turn because accepted Session causal time is
   nondecreasing rather than strictly increasing;
4. it carries the owner-provided judgment identity, exact current head,
   subject, anchors, and bases, and binds UTF-8 source offsets itself; and
5. the Session processor persists that expanded full command before the
   existing learning-command preparation and execution boundary.

The model-emitted compact candidate remains durably inspectable in the sealed
Turn candidate envelope. The Session Part, permission proposal, command
runtime, owner revision, receipt, replay, recovery, and terminal projection all
use the one expanded full command. Full revision input remains available when
the learner actually changes subject identity/scope or exact bases. No new
capability ID, learner-state owner, correction runtime, or causal record was
added.

The exact current-read description also tells the ordinary Agent not to keep
targeting a difficulty that the current successor explicitly resolves. This is
move guidance over current owner truth, not program-computed mastery or a new
selector.

### Equal-time predecessor and permission settlement

`G23-IR-001` exposed a legal edge in the compact handoff. Turn admission and
terminal settlement both use nondecreasing causal time, so a completed
current-read Turn and the immediately following correction Turn may share one
timestamp. The predecessor resolver now accepts terminal time less than or
equal to current admission time. Direction still comes from the exact same-
Session lifecycle and identity facts: the source Turn is completed, its
current-read candidate/invocation/Part is completed and unique for the bound
call, while the consuming Turn/Input is the exact current running owner.

The trace also exposed a related owner constraint boundary. Message
presentation may advance the command's durable admission by one logical
millisecond even while `Date.now()` remains unchanged. Learner-state
permission issue/settlement metadata therefore floors at the exact stored
invocation admission, not the wall clock alone. This keeps capability
settlement at or after the owner disposition without changing the schema,
migration, permission policy, or owner lifecycle. The end-to-end regression
freezes both Turns to the same clock value, proves source terminal equals
correction admission, and still requires the expanded owner-native command to
settle `applied`.

## Deterministic production-path evidence

All tests ran from their owning package on Windows with Bun `1.3.14`. The
following are fresh for the final implementation package or have an unchanged
dependency boundary explicitly stated below.

| Package / command boundary | Result | Decisive claim |
| --- | ---: | --- |
| `packages/opencode`, four Gate 23 `SessionPrompt` tests | **4 pass / 73 assertions** | independent product-floor, equal-time isolated durable successor, zero-write feedback, and exact promoted-steer failure traces all use the released-v1 product path |
| `packages/opencode/test/tool/learning-interaction-range.test.ts` | **9 pass / 16 assertions** | compact predecessor/index binding plus retained signed range continuation; tampering, deletion, wrong Input/index, rewind, gap, reset, and missing predecessor fail closed |
| large-history Interaction search through persistence, exhaustion, and primary-TUI rendering | **1 pass / 12 assertions** | the compact action did not replace or weaken the general bounded Interaction inspection path |
| `packages/core/test/learning-inspection-cursor.test.ts` | **4 pass / 11 assertions** | immutable output authentication, scope/gap tamper rejection, closed schemas, and page-cursor identity remain intact |
| learner-state runtime allow/prompt/deny/replay | **1 pass / 15 assertions** | policy and prompted permission settlement use the full owner-native learning-command runtime and cannot predate the admitted invocation |
| learner-state registry/read checks | **1 pass / 13 assertions** | both provider-schema branches are closed and the lazy owner read remains non-mutating; retained stale-cursor truth is unchanged |
| exact Gate 23 promoted-steer failure | **1 pass / 12 assertions** | a promoted `learner_steer` Input belongs to one exact later failed model operation, with no fabricated success |
| strict root lifecycle, FIFO steer/frontier rebuild, and no implicit start-to-steer conversion | **3 isolated passes / 31 assertions** | root start, pending steer, promotion, replay, and interrupt ownership remain distinct |
| Core promoted-occurrence and production/hibernated Location checks | **3 pass / 5 assertions** | one promoted occurrence binds one model operation; production locations omit preview runner services |
| mounted/public no-preview HTTP route checks | **2 pass / 7 assertions** | no preview Session execution endpoint is registered |
| frozen ten-owner renderer-7 collision | **1 pass / 26 assertions** | all representative owner families remain bounded and losslessly composable |
| primary-TUI current-response/start carrier checks | **2 pass / 13 assertions** | retained TUI start/current-work routing remains on the active released-v1 path |
| `packages/opencode`: `bun run typecheck` | **pass** | the final implementation/test/runner package type-checks |
| repository `git diff --check` | **pass** | no whitespace error; only existing Windows line-ending warnings |

The strict Session tests now use explicit test-level wait/timeout values because
their application fixture initialization exceeded the former two/five-second
test waits on this Windows host. The product Turn budgets and runtime limits did
not change.

A deliberately combined HTTP/Session invocation allowed independent fixtures
to contend for one temporary database and produced `DatabaseBusyError`; an
earlier isolated HTTP steer harness also ended at its own provider-wait timeout.
Those executions are retained as non-acceptance harness evidence. The
corresponding no-preview HTTP checks and Session root/steer checks pass in their
own owning isolation boundaries.

## Bounded current-provider qualification

### Authorization, route, and containment

The maintainer authorized use of the existing Repa OpenAI OAuth credential and
the exact model `openai/gpt-5.6-luna`, with later permission for additional
calls as needed to finish the Gate. Every runner invocation nevertheless used
an explicit finite remaining-total and remaining-leg budget and refused the
next request before body capture or transport when its effective ceiling was
reached. No provider or model fallback was allowed.

The qualification root is:

`C:\Users\Discordance\.codex\campaigns\repa-gate23\evidence\qualification\repa-g23-luna-20260823-01`

Each phase used an isolated database, workspace/config/data/cache/state/temp
boundary, immutable pre-manifest, complete normalized request capture, current
model catalog, ordinary `repa` Agent, application log, runtime disposal,
SQLite `wal_checkpoint(TRUNCATE)`, and final manifest. Every provider-bearing
product Turn entered through the generated v2 SDK used by the local primary
TUI, called the mounted production Session handler through
`Server.Default().app.fetch`, and only then reached released-v1
`SessionPrompt`. The runner captured the exact `session.start`,
`session.awaitTurn`, and `session.messages` request/response chain and joined it
to the durable Session, Turn, root Input, learner occurrence, Assistant/model
operation, Context cut, candidate/invocation/Tool Part, and terminal outcome.
No selected phase invokes `SessionPrompt.Service` directly.

The only allowed external provider route was
`https://chatgpt.com/backend-api/codex/responses`; one bounded OAuth refresh
route was allowed without body capture. Credential and account headers were
replaced at capture time by typed state plus byte length.

### Selected passing phase lineage

| Evidence namespace / phase | Provider requests | Carrier calls | Result |
| --- | ---: | ---: | --- |
| `recovery-35-carrier-final / setup` | 0 | 0 | typed ten-owner fixture setup; no provider or product-carrier claim |
| `recovery-35-carrier-final / collision` | 1 | 3 | ten owner sections, bounded Context, unchanged owner tables; provider request captured and deliberately blocked before transport |
| `recovery-35-carrier-final / clear` | 9 | 15 | exact learner-state/advisory reads, useful diagnosis, reversible default, and detail-conditioned move |
| `recovery-35-carrier-final / ambiguous` | 2 | 6 | one learner-visible A/B referent clarification, no premature solving or owner write |
| `recovery-35-carrier-final / corrected` | 4 | 9 | exact owner successor changes the fresh move from diagnosis to repair/completion; old cut remains byte-exact |
| `recovery-35-carrier-final / zero_write` | 2 | 6 | key-picture explanation changes to one-lane-bridge teaching with owner tables/frontier unchanged |
| `recovery-35-carrier-final / product_floor_setup` | 2 | 3 | ordinary bootstrap plus same-Turn teaching; discriminator absent from Course/route state |
| `recovery-35-carrier-final / product_floor_control` | 1 | 3 | matched read-withheld request asks one minimal clarification and does not guess the source fact |
| `recovery-35-carrier-final / product_floor_positive` | 3 | 3 | directory → compact exact range → exact next Euclidean remainder and successor pair |
| `recovery-35-carrier-final / intermittent_control` | 2 | 3 | elapsed-time return asks one diagnosis question after exact owner read, with no activity inference/write |
| `recovery-35-carrier-final / intermittent` | 7 | 9 | natural compact correction, exact successor, and fresh repair/completion consumer without Interaction history |

All 11 selected phases report `phase_passed`, unchanged pre/post candidate
fingerprints, absent final WAL/SHM, disposed application runtimes, and zero
surviving isolated `auth.json`. They contain **33 captured provider requests**
and **60 captured carrier calls** in total; the collision provider request was
not transported.

The product-floor control and positive start from identical database SHA-256
`27ED3826E4E3CBDD67BC83D436CBC919A2DF297783C798437143D77432B3FB4D`.
The intermittent control and positive start from identical database SHA-256
`462FC4AB7620168942B4C9C9B90EE79B45DE3FA04C3347A93220E4C81D1AF3E5`.
Clear, ambiguous, and corrected start from that same exact ten-owner setup
database hash.

Every selected phase binds one candidate fingerprint,
`BAECF0C39344F1ED4555D21AE114E236A0A2C3E161D10B7B8198FBCE35E43CC3`,
and the exact current 148,156-byte runner at
`E63F903FA64D0D78D10A026DEB989F46F331EEBACB580B83908BC435E4D7CE68`.
Each final manifest rechecks the same post-run candidate fingerprint. The old
`recovery-27..29` selected phases and `recovery-30..34` carrier/oracle repair
diagnostics remain physically retained but are not reused for acceptance.
After the final runner bytes stabilized, every provider-bearing semantic phase
was regenerated. The repair therefore makes no dependency-local old-runner
reuse claim and needs no unretained blob or author-only mutation account.

### Causal results

- **Product floor:** the source Turn created a Course/route with conceptual
  titles and taught the unique `84217 = 3 × 27109 + 2890` step. The numbers do
  not appear in durable Course/route state. The same-request control, with
  Interaction read absent, asks which unfinished example to resume. The
  positive sees no source body until `list_recent` followed by one compact
  `read_recent_range`, then emits `27109 = 9 × 2890 + 1099` and the exact next
  pair `(2890, 1099)`. A generic answer cannot satisfy the oracle.
- **Connected durable successor:** the clear/current revision produces a
  diagnosis action. The corrected current revision produces a
  repair/completion action from an otherwise identical starting database;
  predecessor revision and admitted old Context cut remain immutable.
- **Intermittent use:** trusted time passes without any activity, adherence,
  progress, mastery, completion, abandonment, or state-decay inference. The
  learner's natural correction uses the exact current-read handle and changes
  only learner-state owner tables plus one shared-frontier transition. A fresh
  Session with no correction transcript, compaction summary, or Interaction
  read consumes the exact successor and changes the question from diagnosis to
  repair/completion.
- **Zero write:** same-Session feedback changes a mutex key explanation into a
  one-lane-bridge/waiter explanation with no learning-domain mutation.
- **Collision and ambiguity:** the Context contains all ten representative
  owner families within renderer-7 bounds. The ordinary Agent makes useful
  moves without exposing owner menus; the unsafe two-proof referent receives
  one concise clarification and no solving.

### Diagnostics retained but not promoted

The evidence root preserves all failed or superseded runs. Material examples
include expired OAuth before transport, Bun 1.3.14 Windows startup panics,
one stalled provider stream cancelled without a second concurrent run,
malformed full locator and learner-state commands, a wrong compact correction
handle that used a revision ID, matched-pair operator omission, typed owner
rejection, truthful model/tool exhaustion, and action oracles that rejected
otherwise useful but out-of-class outputs.

The first authorized product-floor leg captured 11 requests against its
original ceiling of eight because the first runner checked the ceiling only
after the Turn. That evidence remains disqualified. The runner was repaired
and a zero-budget phase proved pre-transport refusal before later
authorization. Across all diagnostics and selected runs, the root contains
**141 provider request-capture files / 331 captured provider requests** and
**37 carrier-capture files / 192 captured carrier calls**. Every capture
records `secretScan: passed`. These counts include blocked-before-transport
requests, failed diagnostics, superseded runners, and false-negative action
oracles; they are not claims about successful calls, billable requests,
provider reliability, or accepted evidence volume.

The final whole-root secret scan covered **75,109 files /
2,392,473,963 bytes** and all three sensitive strings in the current OAuth
record. `rg --text --fixed-strings --hidden --no-ignore -f -` received the
patterns only through stdin. It found **0 exact-hit files**, **0 multiline
secret omissions**, and **0 `auth.json` artifacts**.

## Implementation/evidence review and closure

The retained reviewer bound the preceding 15-path candidate and returned
implementation/evidence `Revise` with three High findings. Contract findings
`G23-CR-001..003` remained closed; no owner blocker, contract reopen, or
additional finding was reported.

- `G23-IR-001` found that strict predecessor terminal time `<` current Turn
  admission rejected a legal equal-time Session transition. The resolver now
  uses the accepted nondecreasing relation, learner-state permission metadata
  floors at the exact invocation admission, and the 32-assertion durable-
  successor test forces equality while exercising the complete compact-to-
  owner settlement.
- `G23-IR-002` found that six selected phases depended on an older runner whose
  exact blob/diff was not retained. This repair promotes no earlier selected
  phase. `recovery-35-carrier-final` regenerates setup and every provider-
  bearing semantic phase after runner stabilization and binds one exact
  current candidate/runner in all pre/final manifests.
- `G23-IR-003` found that the old runner called `SessionPrompt.Service`
  directly. The current runner instead uses the generated v2 SDK against the
  mounted production Session handler, captures the exact start/await/messages
  prefix for every product Turn, and joins that prefix to the released-v1
  SessionPrompt/Turn/Context/provider/tool/terminal suffix. Direct handler-
  internal service entry is absent from selected traces.

The same reviewer then returned `Accept` for implementation/evidence and the
Whole Gate:

- `G23-IR-001` is closed after reviewer-side execution of the forced equal-
  time durable-successor test passed with 32 assertions and inspection
  confirmed the exact invocation-time permission floor without schema,
  migration, owner, policy, or replay change.
- `G23-IR-002` is closed after independent recomputation found one selected
  11-phase namespace, one current candidate/runner binding, unchanged pre/post
  fingerprints, matching final database hashes, and no inherited or promoted
  `recovery-27..34` phase.
- `G23-IR-003` is closed after inspection confirmed generated SDK → mounted
  handler → released-v1 SessionPrompt traversal, 60 selected carrier calls,
  exact product identity joins, and unchanged deterministic primary-TUI → SDK
  prefix evidence. Human visual rendering is not claimed by the provider run
  and is not required by the contract's same-handler admission rule.

No replacement or new finding, owner blocker, contract reopen, or material
acceptance-changing unknown remains. The reviewer is retired and must not be
reused for another Gate.

## Failure reuse and cross-Gate composition audit

Gate 23 does not duplicate accepted Gate 8/12/18/21A/22 failure owners. The
current candidate rebinds their product-loop consequences through focused
evidence:

- provider failure before a completed Assistant creates no completed Tutor
  move or owner effect;
- denied/aborted/stale owner commands retain the original occurrence and no
  fabricated revision; the existing learner-state runtime tests remain green;
- a committed owner revision remains exact for a later fresh read;
- pending steer and promoted steer retain separate process-local/durable truth,
  and promoted failure binds only its exact later model operation;
- accepted startup recovery, compaction, source deletion, cancellation, and
  exhaustion evidence remains decisive where the implementation dependency did
  not change; and
- compact Interaction and correction failures settle through the same
  SessionProcessor, Turn candidate/invocation, learning-command runtime, and
  owner terminal paths.

Fresh static and executable checks found no second Tutor runtime. Retained
carrier calls still converge on the released-v1 Session API and common
SessionPrompt/Turn/LLM/SessionProcessor spine. Production locations omit
preview runner services; mounted/public HTTP graphs expose no preview execution
route. The new input-resolution hook is attached only to the existing
learner-state command definition and runs after exact candidate admission,
before the same owner preparation. AI-SDK/native/provider streams below the
common spine remain legitimate implementations, not shadow product runtimes.

No universal activity/outcome/causal table, workflow manager, durable Tutor
move, selected-winner field, background daemon, new hard limit, release
surface, or educational-effect claim was added.

## Current disposition and review handoff

- contract/theory: **accepted**, `G23-CR-001..003` closed;
- implementation/evidence: **accepted**, `G23-IR-001..003` closed with no
  replacement finding or material acceptance-changing unknown;
- production changes: two compact, predecessor-bound inputs over existing
  owner paths, the narrow host-prepared input-resolution seam, and the
  equal-time predecessor/learner-state permission-settlement repair; no
  migration, owner, capability ID, second runtime, or fallback;
- deterministic evidence: passing at the stated focused boundaries;
- bounded current-provider evidence: every affected semantic phase was rerun
  through the primary-TUI SDK/mounted-handler boundary under one current
  runner; all selected phases pass with matched controls and finite per-run
  ceilings;
- integration: the accepted implementation package is committed at
  `db3ae0c80068` and published on `origin/main` through `3517b2044e70`; and
- Whole Gate: **accepted, integrated, and published**; release, provider
  reliability, pedagogy, educational efficacy, and next-Gate
  authority: **absent**.

Publication does not create a release or authorize the next Gate. The explicit
`0.0.1-experimental.0` designation remains an initial experimental prototype,
not a usable or supported product claim.
