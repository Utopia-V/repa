# Gate 21A: Tutor move selection and flow continuity

Status: **contract/theory and implementation/evidence accepted; integrated
into `origin/main`**

Date: 2026-08-12

This document is the accepted derived Gate contract. Fresh top-level reviewer
task `019ff1c6-97c5-7441-bb96-77d863f3a4d5` accepted exact semantic candidate
SHA-256 `307F9D4F5E566FCC97CF2A251B406E9677E0A23C791B2813199C5D200BA0787F`
under review run `repa-g21a-contract-1f881e-20260812`. The current status owner
remains [`docs/README.md`](../README.md); this post-verdict disposition update
changes no accepted decision or implementation boundary.

The reviewer first returned **Revise** for candidate SHA-256
`1F881EB15117DB284F6EA733770B2A1D179D959AEFFB5596BA4A7CEAE0A69E9C`
and opened `G21A-CR-001..003` for retained evidence lineage, synthetic fixture
scope, and the missing renderer-generation migration. The same reviewer then
reproduced the repaired evidence, closed all three findings, and returned
**Accept** with no replacement finding, owner blocker, or material contract
uncertainty.

The candidate derives from the product origin, ADR-0012, ADR-0013, the current
system architecture, and Roadmap 09. Those owners remain authoritative for
stable product meaning, system boundaries, and Gate topology. This document
owns only Gate 21A's proposed local invariant, exclusions, repair boundary, and
acceptance evidence.

## Decision summary

Gate 21A owns the following behavior and evidence boundary:

```text
exact admitted learner request
+ one immutable bounded current LearningContext cut
+ exact retained-steering cut
+ sample-bound lazy reads and typed tools
-> the ordinary repa Agent proceeds with one useful current learning move
   or asks one genuinely necessary learning-level clarification
-> exact Assistant/tool/Turn outcome

correction, relevant committed state change, interruption, provider failure,
or restart
-> a new admitted operation and current cut
-> choose or clarify again without replaying ambiguous work
```

The ordinary interactive Agent remains the only baseline open-semantic
selector. Gate 21A adds no Tutor-move table, durable active-purpose record,
universal scheduler, classifier, controller model, action taxonomy, or second
runtime.

The actual completed Assistant question, explanation, demonstration, guided
step, practice proposal, read/tool use, or other learner-visible action is the
selection result. Its durable provenance is the existing chain from exact
Turn/Input through admitted model operation and Context cut to Tool Parts,
Assistant content, and terminal Turn outcome. A new `selectedCandidate` field
would claim false causal precision when one useful move legitimately composes
several producer pressures at once.

The required pre-contract experiment found one narrower production defect
before semantic model qualification could begin: the current Gate 21 Context
renderer cannot admit a legal, synthetic, saturated cross-owner collision
under Gate 18's existing 16 KiB model-facing bound, even though its `material`
and `learner_response_evidence` families are empty. Gate 21A therefore includes
one versioned **composition-reachability repair** to the current model-facing
Context projection. The repair must preserve the complete canonical cut,
owner truth, exact semantic entries, omission truth, lazy-read reachability,
and byte-exact replay of every prior Context generation. It may compact only
repeated fixed policy/audit representation that the model does not need to
choose or retrieve the current move. The retained run establishes a legal
capacity counterexample, not a completed every-family semantic collision.

Decision ID `G21A-FLOW-001`.

## Product invariant

The Learning System, not the learner, normally turns a bounded current learning
situation into a useful next move. An exact learner request controls what it
actually specifies. Retained steering continues to constrain non-overlapping
behavior. Legal Course/navigation, Goal, FutureAttention, Assignment,
learner-state judgment, advisory suggestion, recent Interaction, evidence,
material, omission, time, and capability facts remain distinct pressures and
constraints; their storage or render order never selects a winner.

When the exact request and current facts support an evident move, the Tutor
proceeds. When several moves are all harmless local choices, it may make one
transparent reversible choice and remain easy to redirect. It asks a concise
learning-level clarification only when proceeding would require a
learner-owned value or commitment, an authorization, or an unsafe-to-assume
interpretation whose plausible answers materially change the action.

The result is not required to be pedagogically unique or objectively optimal.
More than one explanation, question, example, or guided step may satisfy the
same oracle. Acceptance concerns truthful composition, low learner management,
causal use of relevant state, correction, and recovery—not an exhaustive proof
that no other useful move exists.

Decision ID `G21A-CHOICE-001`.

## Required pre-contract experiment

### Question and stopping condition

The experiment asked:

> Can the ordinary released-v1 `repa` Agent, with the exact current request,
> retained steering, Course/navigation, Goal, due FutureAttention, open
> Assignment, learner-state, advisory, recent-Interaction pressure, and only
> owner-native reads, causally distinguish a clear reversible move from one
> learner-owned ambiguity without an extra selector or internal-state Turn?

The primary falsifier is a paired collision. Both target requests are exactly:

> 继续我刚才那个证明。帮我找出错误的归纳步骤，但先用一个问题引导我自己发现，不要直接给完整证明。

The clear arm contains one recent induction attempt. The ambiguous arm contains
two materially different attempts. With the same Course, Goal, retained
steering, due FutureAttention, open Assignment, learner-state judgment, and
advisory suggestion, the clear arm should proceed with one substantive
scaffold question while the ambiguous arm should ask which proof the learner
means. The pair is stronger than two unrelated plausible responses because
only the learner-owned ambiguity should flip the action class.

The experiment is disposable qualification infrastructure. Production code
must not import it. The isolated databases, provider capture, and diagnostic
copies remain outside Git; the untracked candidate runner is retained only if
the accepted Gate needs it for reproducible qualification. If the contract
rejects that need, the candidate runner is deleted rather than becoming a
general framework.

### Isolation and provenance

The experiment began from clean tracked baseline
`97212bcb8786c63e2c2c2a01d553f7707474ea29`. Its runner uses:

- a fresh workspace and database per phase;
- isolated HOME/XDG/config/cache/state/temp paths;
- the normal released-v1 `SessionPrompt` and ordinary `repa` Agent;
- `openai/gpt-5.6-luna` only for semantic target phases;
- typed production Course and learning-command paths for deterministic setup;
- a zero-provider setup ceiling and bounded per-phase provider ceiling;
- exact Context/capability/Turn summaries and whole learning-domain table
  digests before and after target Turns;
- credential/account-header redaction and a provider-body secret scan; and
- retained failed snapshots rather than silent retries or rewritten evidence.

### Retained evidence lineage and limitation

The retained evidence root is
`qualification/repa-g21a-luna-20260812-06` beneath the local Gate 21A campaign
directory. The production source under test is baseline
`97212bcb8786c63e2c2c2a01d553f7707474ea29`. The following hashes bind the
claims retained by this contract:

- `partials/setup.json` SHA-256
  `6EE17D30BD1BA535AE0028C9DDA50959501178EFE847F699539184D92C766BEB`
  records seven typed setup settlements, an empty permission-request list, and
  `providerRequests=[]` under a zero-request ceiling.
- `snapshots/typed-base.db` SHA-256
  `DBB272DAAFFAAD0CC8BF072C47921C91A9E5DB47720658A26D9329729387D665`
  is the exact retained setup database. It contains seven completed synthetic
  learner root Turns but zero Material Map/alignment rows and zero
  learner-response-evidence rows.
- the current untracked runner has SHA-256
  `C809261613BF42F09DEDAABBD19FAE34C758C5EA415972CD910AF5D6D0D2B9D4`.
  It was modified after the retained `17111` diagnostic, and `setup.json` does
  not bind any runner digest. It is therefore not retroactive source proof for
  the setup or diagnostic values below.

The setup's direct fixture admissions are structurally legal production
prepare/execute/settle transitions, but they are not provider-mediated semantic
provenance. Together with the two empty owner families, that limits this run to
a synthetic legal composition and capacity counterexample. Gate acceptance
still requires a pinned, fully representative collision with nonempty
`material` and `learner_response_evidence` contributions where legally
applicable.

### Typed setup result

The final typed setup created, without a provider call:

- a default Course and exact working induction item;
- an active Course-scoped Goal;
- retained steering to ask one scaffold question before a decisive proof step;
- one due source-linked FutureAttention concern requiring a learner response
  before a decisive hint;
- one open due Assignment;
- one active anchored learner-state judgment; and
- one active fallback advisory suggestion.

Every mutation passed the production prepare/execute/settle path. The setup
phase terminalized with `providerRequests=0` and an exact domain digest. Its
seven prior Interactions and several authorship/source bases are runner-created
synthetic admissions; they prove structural reachability, not model-authored
fixture semantics.

### Decisive failure

An earlier retained snapshot,
`snapshots/clear-owner-failure.db` SHA-256
`0932BA5066FF5991A4CD32986A8583F816E319DD4FD07EE7F254BB6A677A5872`,
contains Turn `trn_ff1b99021001d8wSNrWwOvc6SB` terminalized as
`failed / owner_failure` with `model_count=0`; it contains no durable exact
capacity value. It is not the source of the later `17111` observation.

The later diagnostic copy `diag-owner-20260812-01.db` SHA-256
`95DDBE12BEEF503BC5FA89F34285E41F8ECBF6D4CC2A4F7DA4342FE19A388F6D`
contains Turn `trn_ff1bce92e001y3Dk6UUIApMZSs`, also terminalized as
`failed / owner_failure` with `model_count=0`. Exact log artifact
`data/repa/log/repa.log` SHA-256
`294850E207DC3B9AE060F160FAC62E91D28B8891F335482AEEF6F84A7E38A3F2`,
line 38, binds that Turn to:

```text
LearningContext.CutCapacityError
rendered bytes 17111 / ceiling 16384
Turn terminal: failed / owner_failure
provider transport: not reached
```

`owner_failure` was only the outer Turn classification. The retained log
exposes the exact cause at
`LearningContext.finalize -> fit -> SessionPrompt.runTurn`. The production
source is baseline-bound, but the disposable runner revision that invoked it is
not; this exact value is retained as an observed capacity failure, not as a
reproducible phase manifest.

The provider-blocked capability diagnostics establish only the following
durable results:

| One read capability withheld | Durable result and exact binding |
| --- | --- |
| recent Interaction read | `diag-omit-learning-interaction-read.db`, SHA-256 `5DD47A72938C4EAB7ABED651983BCC151A95D3302D3B277825DD5E5402245173`, Turn `trn_ff1bf6687001QuNb1bVKEG9pKL`: `failed / owner_failure`, `model_count=0`; no admitted target cut and therefore no retained exact rendered-byte value |
| Assignment read | `diag-omit-assignment-read.db`, SHA-256 `4AD022DE2687A5E0700390E2404EB9F4589E8C28E56FB9A6D308776736D373EA`, Turn `trn_ff1bfa622001jo4b1TU6h1D7uP`: `failed / owner_failure`, `model_count=0`; no admitted target cut and therefore no retained exact rendered-byte value |
| FutureAttention read | `diag-omit-future-attention-read.db`, SHA-256 `F8F57A43A3A96824294C528D41026C8A8AC1B2719D59D00D4EA990E2B449E2CE`, Turn `trn_ff1bfb5ec001vDryITAl1kDNnB`: `failed / owner_failure`, `model_count=0`; no admitted target cut and therefore no retained exact rendered-byte value |
| advisory-suggestion read | `diag-omit-advisory-plan-suggestion-read.db`, SHA-256 `43FA9B44C8859F81A56B62E79142033071297E85496590199D792478919F14F3`, Turn `trn_ff1bf78840018sVRcfGu2friVk`, Assistant `msg_ff1bf79e3001ZcQlGGbPm0Jq5M`: admitted v6 cut `8e45dc9de7b71f364e03a5ee226fd95ee51d197e76a3b5286609567969152541` at `16260 / 16384`, then `provider_failure` at the deliberately blocked transport |
| learner-state-judgment read | `diag-omit-learner-state-judgment-read.db`, SHA-256 `6F836B0F03250BBB06B46229955BA5A911FB9987F250E2ED1590ED6CA3FE4467`, Turn `trn_ff1bf9115001WkPc4iPkuB7M4W`, Assistant `msg_ff1bf928f001BnWjgjr49k7Qhh`: admitted v6 cut `c7c31998932ecc4c4cf783288499213cb895d23962435577caf6371426ab1edc` at `16175 / 16384`, then `provider_failure` at the deliberately blocked transport |

The advisory-withheld cut's stored rendered block independently yields 13,055
UTF-8 bytes for its single `sections (canonical order is not priority):` line.
It had already downgraded eligible semantic values to locator-only where legal,
removed extra entries, retained only one recent Interaction, and preserved the
mandatory sole FutureAttention, sole Assignment, and learner-state entry.

The earlier console-only `17084`, `17094`, and `17088` values and the claimed
27-byte Interaction delta have no retained queryable binding and are withdrawn;
they are not Gate evidence. The retained data still proves a narrower causal
fact: a legal current v6 composition, even with two owner families empty,
cannot reach the ordinary Agent under the current representation and hard
bound. It does not yet prove a completed every-pressure semantic collision.

This is a composition defect. Hiding either learner-state memory or advisory
advice, shortening learner-authored semantic facts, asking the learner to pick
an internal owner, or increasing provider attempts would conceal rather than
repair it.

Decision ID `G21A-EXP-001`.

## Owned boundary

Gate 21A owns all of the following together.

### Ordinary move selection

For every admitted interactive root operation, the ordinary Agent receives the
exact learner request in normal conversation context and one immutable current
Context/steering/capability basis. It may:

- directly answer, explain, demonstrate, ask a scaffold question, propose
  practice, review, plan, research, or use an authorized tool;
- compose several producer pressures in one move without first classifying a
  single winning record;
- make a transparent reversible local choice where several choices are safe;
- use owner-native lazy reads when omitted or exact detail can change the move;
  or
- ask one concise learning-level clarification at a genuinely learner-owned or
  unsafe ambiguity.

### Composition reachability

A fully populated representative legal collision containing every
still-admitted baseline owner family through Gate 21—including nonempty
Material and learner-response-evidence contributions where legally
applicable—must be able to produce an admitted operation under the existing
32 KiB canonical and 16 KiB model-facing Context bounds.

The new current Context identity is frozen as
`(schemaVersion=1, policyVersion=6, rendererVersion=7,
capabilityCatalogVersion=6)`. The hard limits remain exactly 32,768 canonical
bytes and 16,384 rendered bytes. Policy 6, capability catalog 6, the owner set,
and fitting semantics do not change; `(policyVersion=6, rendererVersion=6)`
becomes a frozen Gate 21 replay generation, while `(6,7)` is the only new
current tuple.

The repair is therefore a new renderer generation over the existing Context
owner set and policy semantics:

1. The canonical cut remains the complete structured audit value. No owner,
   exact entry, count, omission, dependency, capability binding, or fingerprint
   is removed from durable truth.
2. Old renderer generations v1–v6 remain byte-exact and decode with their
   original policy/capability meanings. A new request never rewrites or
   re-renders an old cut.
3. The current model-facing projection retains the cut header/fingerprint,
   cut time/frontier, retained-steering binding, compact provider-capability
   binding, every owner name, coverage, count, omission, exact retained entry,
   move-relevant mode/time, and every directory cursor needed for a cut-bound
   lazy read.
4. The model-facing projection may omit per-section `scope` and
   `selectionBasis` strings that are fixed by the renderer/policy generation,
   raw owner-cut fingerprints already sealed by the whole cut and cursor, and
   repeated per-owner negative prose. It replaces those repetitions with one
   concise composition legend that preserves their operative implications.
5. It never truncates, paraphrases, reauthors, or host-summarizes an
   owner-authored semantic value. Entry-level and family-level fitting remains
   whole-value, deterministic, and omission-honest.
6. If the truly irreducible move-relevant projection still cannot fit, admission
   continues to fail before provider transport. The repair does not make the
   hard bound advisory or silently drop an owner.

The implementation may choose an equivalent compact representation if tests
prove the same preserved and omitted sets. It may not raise the 16 KiB bound,
weaken exact replay, or hide an owner as a shortcut without revising this
contract with comparative cost and omission evidence.

### Versioned database migration

Adding tuple `(6,7)` changes the behavior-bearing
`turn_learning_context_cut_canonical_shape` CHECK. Gate 21A therefore explicitly
owns one physical Repa database migration from current `user_version=23` to
`user_version=24`:

1. rebuild `turn_learning_context_cut` with the same eight columns, foreign key,
   byte/fingerprint/time constraints, and strict tuple union `(1,1)` through
   `(6,6)` plus `(6,7)` only;
2. copy `assistant_message_id`, `canonical_cut`, `canonical_bytes`,
   `cut_fingerprint`, `cut_as_of`, `rendered_block`, `rendered_bytes`, and
   `rendered_fingerprint` verbatim with `INSERT ... SELECT`;
3. perform no decode, current renderer call, current owner read, semantic
   projection, fingerprint recomputation, or historical hard-limit change;
4. preserve the immutable-cut trigger, foreign-key graph, and current schema
   extras without adding a learning-domain table; and
5. make fresh and upgraded databases use the same strict SQL and runtime tuple
   routing. Invalid mixed tuples remain rejected.

The runtime must route `(6,6)` to its frozen Gate 21 renderer/validator and
`(6,7)` to the compact renderer. It must not treat an unknown tuple as current
or fall back to a nearby generation.

### Causal selection provenance

The exact evidence chain is:

```text
learner Turn/Input and occurrence
-> admitted model operation / Assistant message
-> exact retained-steering and LearningContext fingerprints
-> provider-visible capability surface
-> exact lazy-read Tool Parts, if any
-> complete Assistant/tool result
-> terminal Turn outcome
```

The selection result is the actual action in that chain. Gate 21A does not
require the model to emit hidden rationale, a candidate ranking, a purpose
enum, or a self-declared winner. Causal use is demonstrated by paired and
counterfactual traces: changing one relevant source/correction/ambiguity must
change the action when the contract predicts a change, while storage-order or
irrelevant perturbations must not.

### Re-entry and flow continuity

After a natural correction, relevant committed owner change, non-mutating lazy
read, interruption, cancellation, provider failure, or restart:

- a later model operation receives a newly compiled current cut;
- already committed owner effects remain committed;
- a failed or interrupted model operation creates no completed Assistant move;
- ambiguous model work is not blindly resent;
- startup recovery truthfully closes orphaned running work;
- clock passage and absence create no activity, adherence, progress, mastery,
  breach, completion, or abandonment; and
- the learner is not asked to manually synchronize Course, Goal,
  FutureAttention, Assignment, learner-state, advice, or Interaction records.

Decision ID `G21A-OWN-001`.

## Explicit exclusions

Gate 21A does not own or authorize:

- a new Course, Goal, FutureAttention, Assignment, learner-state, advisory, or
  Interaction lifecycle;
- a universal `Agenda` owner, scheduler, scalar priority, workload allocator,
  or feasibility authority;
- a mandatory preliminary model call, classifier, selector Agent, controller
  service, or second runtime;
- a deterministic natural-language parser, keyword rule tree, semantic
  uniqueness proof, or exhaustive candidate tournament;
- a fixed teaching workflow, pedagogy taxonomy, or enum for every useful move;
- a durable current-purpose, activity, adherence, or Tutor-move record;
- automatic progress, mastery, Assignment completion, plan adherence, service,
  or product-success inference;
- a rule that every move must read or mutate a learning-domain owner;
- learner-visible general inspection/correction UI, which remains Gate 22;
- the integrated longitudinal product loop or carrier/release claim, which
  remains Gate 23; or
- educational efficacy or globally optimal pedagogy.

Contract/theory closure requires neither a credentialed provider call nor a new
domain schema. Whole-Gate acceptance still requires the physical constraint
migration and semantic qualification specified below.

Decision ID `G21A-NONOWN-001`.

## Action-scoped policy composition

Policy applies per proposed action and applicable scope, not by selecting one
producer record as a global winner:

1. hard safety, domain legality, source/currentness rules, and external-effect
   permission always apply;
2. the exact current request controls what it specifies;
3. retained steering controls non-overlapping behavior and yields locally only
   to a clearly more specific overlapping request;
4. Course/navigation, Goal, due FutureAttention, Assignment, learner-state
   judgment, advisory suggestion, Interaction/evidence, material, time, and
   omission expose distinct facts and trade-offs;
5. conditional defaults already earned by an earlier owner retain their exact
   narrow meaning; and
6. ordinary model judgment realizes one current interaction within those
   bounds.

A single move may simultaneously satisfy several of these facts. For example,
one scaffold question may honor retained learner-first steering, address a due
FutureAttention concern, help with an open Assignment, adapt to a learner-state
uncertainty, and follow useful advisory advice. Recording one of those rows as
the winner would erase the causal composition the product actually needs.

An exact request may override overlapping FutureAttention or old advice without
serving, retiring, or rewriting them. Assignment pressure never proves that its
work is the current/default task. Learner-state judgment remains fallible
memory, not priority or mastery. Advice remains correctable suggestion, not
schedule or commitment. Deterministic database order remains audit order, not
pedagogical priority.

Decision ID `G21A-POL-001`.

## Clarification boundary

Proceed without clarification when:

- the learner's current referent is sufficiently identified by same-Session
  history or an exact owner read;
- one move is directly requested;
- a safe local move is transparent and reversible; or
- different reasonable realizations do not require a learner-owned value,
  commitment, authorization, or expensive-to-reverse choice.

Ask one concise learning-level clarification when:

- two materially different learner-authored referents remain live and the
  answer changes which work is examined;
- the choice changes a learner commitment, due-work trade-off, or externally
  consequential action;
- proceeding would assert an unsafe unsupported interpretation; or
- required observation/write authority cannot be inferred or safely defaulted.

The question names the learner-visible distinction. It does not mention
internal IDs, owner tables, lifecycle labels, candidate ranks, Context cuts,
or ask the learner to curate application state.

Decision ID `G21A-CLARIFY-001`.

## Reuse audit

### Reuse unchanged

- released-v1 Session, Turn, message/part, provider, tool, permission,
  cancellation, compaction, and startup-recovery mechanics;
- the default `repa` primary Agent and existing product prompt;
- Gate 15 exact retained-steering cut and protected rendering;
- Gate 18 model-operation admission, immutable canonical cut, exact rendered
  replay, capability binding, omission, lazy reads, and capacity accounting;
- Gate 19 occurrence/evidence distinctions;
- Gate 20 conditional FutureAttention default and service separation;
- Gate 20A Assignment authority;
- Gate 20B learner-state judgment authority; and
- Gate 21 advisory-suggestion authority.

### Adapt

- the current LearningContext renderer, by adding the frozen `(6,7)` composed
  model-facing projection whose fully representative collision fits the
  already accepted hard bound;
- strict schema/runtime routing for frozen `(6,6)` and current `(6,7)`, plus
  one physical v23-to-v24 constraint migration that byte-copies historical
  cuts; and
- focused tests and the isolated qualification runner, so behavior rather than
  mere visibility is proved.

### Refuse

- a selection domain table or activity ledger;
- a model self-report treated as causal provenance;
- a context-size fix that disables one legitimate owner;
- a global hard-bound increase without explicit cost/omission evidence;
- host paraphrase or substring truncation of authored semantic entries; and
- a Gate21A-specific execution loop outside ordinary `SessionPrompt`.

Decision ID `G21A-REUSE-001`.

## Acceptance evidence

### A. Context reachability and replay

Focused deterministic evidence must prove:

- a fully populated representative collision reaches an admitted current
  Context under 32 KiB canonical and 16 KiB rendered limits;
- every owner family is present with exact coverage/count/omission truth,
  including nonempty Material and learner-response-evidence contributions where
  legally applicable;
- sole FutureAttention and Assignment complete entries, learner-state compact
  entry, advisory compact entry, recent Interaction, Course/navigation, Goal,
  Material, learner-response evidence, retained steering, and capability
  binding remain model-visible;
- every cut-bound learner-state/advisory directory cursor needed for exact
  current/discover reads remains visible and usable;
- maximum valid semantic values are whole, never substring-truncated;
- extra candidates are downgraded or removed only under existing deterministic
  fitting rules with exact `gate18_byte_budget` omission;
- the new rendered projection is a deterministic function of the canonical
  cut and its exact bytes/fingerprint are stored atomically with admission;
- a fresh database and a migrated database both create every new cut only as
  tuple `(6,7)` with capability catalog 6 under exact limits 32,768/16,384;
- old v1–v6 cuts decode and replay byte-identically without current owner reads
  or current renderer behavior; and
- provider request capture contains the exact stored current rendered block.

A frozen v23 historical fixture must contain representative stored cuts for
every admitted tuple `(1,1)` through `(6,6)`. Migration evidence compares all
eight `turn_learning_context_cut` columns before and after upgrade and proves
identical row count, bytes, byte counters, fingerprints, IDs, and cut times. It
also proves:

- `PRAGMA user_version` advances exactly from 23 to 24;
- `integrity_check` and `foreign_key_check` pass and the immutable-cut trigger
  still rejects mutation;
- the rebuilt CHECK admits exactly the six frozen tuples plus `(6,7)` and
  rejects other mixed or future tuples;
- SQL and runtime retain the common 32,768-byte canonical and 16,384-byte
  rendered limits for old and new rows; and
- upgrade succeeds without decoding/re-rendering an old cut or consulting any
  current learning-domain owner.

### B. Ordinary-Agent behavior

The semantic qualification uses the ordinary released-v1 production path. At
minimum it covers:

1. **paired clear/ambiguous collision** — the exact target request proceeds
   with one substantive scaffold question for one live proof, but asks one
   learner-visible referent clarification for two live proofs;
2. **exact-request override** — a direct request controls the overlapping move
   without mutating or serving unrelated producer state;
3. **transparent reversible default** — an underspecified but safe continuation
   begins a useful move without an internal menu;
4. **producer composition** — due FutureAttention, open Assignment,
   learner-state, advice, Goal, steering, Course, Material,
   learner-response evidence, and recent Interaction can jointly govern one
   move without a declared winning row;
5. **natural correction** — correcting learner-state or advice changes a later
   move and the old admitted cut remains byte-exact;
6. **omission/lazy detail** — when exact detail can change the move, the Agent
   uses the authorized owner read; absent, stale, wrong-revision, or withheld
   detail is handled truthfully; and
7. **no management leakage** — learner-facing text contains no internal IDs,
   Context vocabulary, state-management instructions, or claim that time,
   silence, Assignment state, or advice proves activity/progress/adherence.

The oracle accepts multiple useful wordings and actions. It checks action
class, causal reads, forbidden claims, learner management, and durable
non-effects rather than exact prose snapshots.

### C. Failure and continuity

Deterministic and production-path evidence must cover:

- provider failure before any completed Assistant result;
- learner cancellation and ancestor interruption;
- process restart/startup recovery of orphaned running Turns;
- committed domain effect followed by later provider failure;
- no automatic resend of ambiguous model work;
- a new cut/fingerprint after correction or relevant state change;
- old cut/request replay remaining exact;
- no fabricated FutureAttention service, Assignment lifecycle, learner-state
  change, advisory revision, progress, activity, or adherence; and
- the later ordinary Turn selecting or clarifying again from current truth.

### D. Cost and route

Evidence records:

- provider/model/runtime route;
- model operations, tool continuations, retries, and provider request count;
- rendered Context bytes and whole-request capacity classification;
- wall latency and available usage/cost fields without inventing absent cost;
- redacted provider request fingerprints; and
- proof that no mandatory control-only sample or second runtime was added.

### E. Phase manifests

Every later setup, target, ablation, correction, failure, and replay phase must
write an immutable manifest before the runner or starting database changes. A
manifest binds:

- baseline/implementation commit or exact working-tree manifest, contract
  digest, runner SHA-256, runtime/package version, and migration version;
- starting database SHA-256 and any intentionally inherited evidence manifest;
- exact Session/Turn/Input/Assistant IDs and request, steering, Context,
  capability-surface, rendered-block, result, and terminal fingerprints;
- result database, log, redacted request capture, and summary artifact hashes;
- provider/model/route, exact provider-request count, retries, tool
  continuations, timestamps, capacity result, and terminal outcome; and
- which values were directly stored, independently derived, or unavailable.

A later-mutated runner, console-only number, or similarly shaped earlier Turn
cannot retroactively support a phase. Secret material remains excluded or
redacted; the manifest binds the redacted artifact and the secret-scan result,
not credentials.

Decision ID `G21A-EVIDENCE-001`.

## Failure matrix

| Situation | Required result |
| --- | --- |
| legal combined Context exceeds because of repeated renderer metadata | new current renderer compacts only fixed/redundant representation; canonical truth and old generations remain exact |
| truly irreducible current Context still exceeds the hard bound | fail before provider transport with exact capacity evidence; do not hide an owner or silently widen the bound |
| one obvious reversible move exists | proceed and remain redirectable |
| two materially different learner-owned referents remain | ask one concise learner-visible clarification |
| producer order changes but facts do not | no first-row priority or declared winner |
| exact current request conflicts with an old default/advice | honor the request within hard constraints; do not mutate the overridden owner |
| needed lazy detail is unavailable, stale, or unauthorized | expose the typed condition and either use a safe bounded alternative or clarify; never fabricate detail |
| learner corrects a judgment/advice/source | append through the owning correction path; the next operation sees a new cut and chooses again |
| provider fails or Turn is interrupted | no completed Assistant move or inferred durable effect |
| crash follows a committed domain write | preserve the write and reconcile settlement; do not repeat it or infer model completion |
| application restarts with orphaned model work | mark it interrupted and require a later admitted Turn for any new choice |
| learner returns after silence | infer no activity, zero progress, adherence, breach, or abandonment |

## Implementation boundary

If this contract is accepted, the expected production change is narrow:

- `packages/core/src/learning-context/schema.ts` for explicit frozen v6 and
  current v7 renderer identities while policy/capability remain at 6;
- `packages/core/src/learning-context.ts` for the composed current renderer and
  strict decode/replay routing;
- `packages/core/src/learning-context/sql.ts`, the next Repa migration, and
  generated database artifacts needed to admit exact tuple `(6,7)` on fresh
  and upgraded v24 databases;
- focused Core Context tests for full collision fit, preserved projection,
  strict tuple rejection, and frozen v1–v6 replay;
- a frozen-v23 migration fixture and focused migration test for byte-exact
  eight-column preservation, unchanged limits, trigger/FK integrity, and
  v23-to-v24 routing;
- focused OpenCode Session tests for exact request/cut/provider composition and
  failure/re-entry; and
- the isolated real-model qualification runner, phase manifests, and evidence
  record.

The v23-to-v24 migration is required because the existing CHECK rejects the
new tuple. It changes no learning-domain schema, owner lifecycle, historical
cut value, hard limit, or capability catalog. The implementation must not
invent a selector module or change the default Agent/runtime unless new
evidence disproves the accepted narrow boundary.

## Independent contract review closure

The original reviewer received the repair as a delta containing:

- the authority chain and current baseline commit;
- this exact repaired contract candidate and its new digest;
- `G21A-CR-001..003`, their original counterexamples, and the exact retained
  artifact/Turn/hash bindings above;
- the corrected synthetic/empty-family limitation and future manifest rule;
- the frozen `(schema=1, policy=6, renderer=7, capabilityCatalog=6)` identity
  and required physical v23-to-v24 migration;
- the current LearningContext fitting/rendering code and prior Gate 18/20B/21
  constraints.

The reviewer specifically tried to falsify:

1. that the capacity failure is a real legal composition rather than an invalid
   fixture;
2. that a model-facing renderer compaction can preserve all move-relevant and
   lazy-read truth without host paraphrase;
3. that the existing Interaction chain is sufficient selection provenance;
4. that the paired behavior trace distinguishes causal state use from a
   merely plausible response;
5. that no hidden selector, global priority, activity inference, or Gate 22/23
   responsibility leaked into the contract; and
6. that the evidence matrix can falsify the claimed result without requiring
   pedagogical uniqueness.

The original reviewer re-read the complete repaired candidate, independently
recomputed all ten cited retained-artifact digests, reproduced the decisive
SQLite and source facts, closed `G21A-CR-001..003`, and returned **Accept** for
the exact semantic candidate above. No acceptance-changing finding remains at
the contract/theory layer. Implementation/evidence remains a separate layer.

## Maintainer-owned decisions

No current question requires a maintainer grill. The product and accepted
architecture already decide ordinary-Agent-first behavior, exact-request
priority, reversible choice versus necessary clarification, separate producer
authorities, no scheduler/classifier/durable active purpose by default, and
reselection after failure or change.

A grill becomes necessary only if later evidence shows one of these materially
different boundaries:

- repeated semantic failure survives Context/prompt/tool repair and would
  justify an additional control sample or program policy with new latency,
  cost, and failure topology;
- preserving a representative legal collision truly requires increasing the
  model-facing hard bound rather than removing redundant representation; or
- Gate 22 requires a durable machine-queryable purpose claim that cannot be
  truthfully derived from the actual Interaction chain.

Until then, adding those mechanisms would be speculative expansion rather than
Gate 21A completion.

## Current disposition

The fresh independent contract/theory review is **accepted**. The accepted
repair narrows the pre-contract claim to its durable evidence, requires a fully
representative later collision and immutable phase manifests, and adds the
previously omitted renderer-version migration boundary. `G21A-CR-001..003` are
closed, so this contract authorizes only the scoped implementation boundary
above.

The accepted implementation restored composition reachability and v23-to-v24
compatibility, then completed the paired semantic qualification and retained
failure/re-entry evidence on a pinned lineage. The same top-level reviewer
closed `G21A-IR-001..008` and accepted implementation/evidence without reopening
this contract. Implementation commit
`d43109fc3dd67301327f9a5aa7379b0abc98e079` is fixed on the feature branch and
included in `origin/main` through local-integration/status commit
`6d7855d9a6f8a444e6dabc5f7728a4437a113c2c`. No release, Gate 22, or Gate 23
claim follows.
