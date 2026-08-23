# Gate 23: integrated Learning-System product loop

Status: **contract/theory and implementation/evidence accepted;
`G23-CR-001..003` and `G23-IR-001..003` closed; Whole Gate accepted;
locally integrated at implementation commit `db3ae0c80068`; not pushed or
released**

Date: 2026-08-23

Exact derivation baseline: clean `main`/`origin/main` commit
`e2bcaa62a2b7f475528ad3c37e230bc8062d1270`, which records Gate 22 mainline
integration at implementation commit
`ada0a04c19847ce62ae490c90838c88c51a65d72`. Gate 22's accepted Windows
working-tree package and its behavior-equivalent commit-tree projection differ
only by the recorded CRLF-to-LF normalization. No Gate 23 implementation,
qualification run, or release claim exists at this baseline.

Whole-Gate review run `G23-WG-20260823-5F9B9860-01` retains fresh top-level
reviewer task `01a02d7f-8926-7562-82c3-06d2fadb1143` across the
contract/theory and implementation/evidence layers. Its first contract pass
returned **Revise** for `G23-CR-001..003`. The closure pass accepted the exact
36,588-byte repaired semantic candidate at SHA-256
`CDFE23F708DCCF3C5327EEDED6B1436BB2FA84CFB3B32801B0C0122E37512D1F`,
closed all three findings, opened no replacement finding, and reported no owner
blocker or material contract-layer unknown. This post-verdict status update
changes no accepted decision. Contract acceptance by itself authorized only
the implementation/evidence boundary below; it did not accept that layer or
the Whole Gate.

The retained reviewer's first implementation/evidence pass later returned
`Revise` for one legal equal-time predecessor defect, one unrecoverable
old-runner evidence reuse, and one below-carrier provider-runner entry. The
executor repair uses nondecreasing Session order with invocation-time
permission floors, reruns every affected semantic phase under one exact
current runner, and enters through the primary-TUI generated SDK plus mounted
production Session handler. The closure pass retested the original
counterexamples, closed `G23-IR-001..003`, opened no replacement finding, and
returned `Accept` for implementation/evidence and the Whole Gate. Integration,
release, provider reliability, pedagogy, and educational efficacy remain
separately governed; this status update does not alter the accepted contract.

This document derives from the
[product origin](../foundation/00-product-origin.md),
[ADR-0003](../decisions/0003-learning-state-follows-evidence.md),
[ADR-0005](../decisions/0005-durable-turn-and-interaction-hierarchy.md),
[ADR-0008](../decisions/0008-model-write-initiative-and-durable-authority.md),
[ADR-0009](../decisions/0009-separate-invocation-and-semantic-effect-identity.md),
[ADR-0012](../decisions/0012-learning-centered-modular-monolith.md),
[ADR-0013](../decisions/0013-conditional-current-purpose-composition.md),
the [system architecture](../architecture/00-system-architecture.md), the
[native learning data model](../architecture/01-native-learning-data-model.md),
and [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md). Those owners
retain stable product meaning, architecture, authority separation, and Gate
topology. [`docs/README.md`](../README.md) remains the sole current-status
owner. This contract owns only Gate 23's product-composition invariant,
production-path admission, exclusions, and falsifiable acceptance evidence.

## Decision summary

Gate 23 proposes one production-composition boundary:

```text
real learner situation
-> one useful ordinary Tutor move on the released-v1 production spine
-> an exact learner occurrence or completed outcome
-> zero durable learning write when no later owner meaning is warranted,
   or one owner-native, source-bearing, correctable durable consequence
-> a later admitted operation with current same-Session history and/or a new
   bounded LearningContext cut plus authorized lazy owner reads
-> a later ordinary Tutor move that changes when the relevant current truth
   changes
```

The product result is the connected behavior of the Learning System. It is not
a new domain record, a model rationale, a causal-attribution table, or a claim
that one context row uniquely caused one sentence. Exact runtime identity and
paired counterfactual traces establish the admitted path and action change;
the model retains open semantic authorship.

All retained natural-language interactive carriers converge on the one
released-v1 `SessionPrompt` / durable Turn / model-operation / Tool / terminal
spine. Hibernated preview-v2 Session execution remains non-executing and may
not support a Gate 23 product claim. Direct shell/admin operations are retained
harness capabilities, not alternate Tutor carriers.

Decision ID `G23-LOOP-001`.

## Parent problem and independent Gate boundary

Gates 4–22 have separately accepted the first-boundary learning owners,
bounded Context, durable Turn/Interaction lifecycle, ordinary-Agent move
selection and re-entry, and primary-TUI inspection/correction. Their local
correctness does not prove that one learner journey crosses their handoffs.

Gate 23 asks whether those capabilities now form the first integrated
Learning-System product loop rather than a collection of independently green
features. It owns this cross-boundary handoff because no earlier owner may
absorb it without changing its meaning:

- Interaction owns admitted learner input, model/tool work, conversation
  presentation, and terminal outcome, not long-term learner meaning;
- each learning authority owns its own source, identity, revisions,
  transitions, correction, and failure semantics;
- LearningContext owns one immutable bounded observation cut, not current
  truth or model causality;
- Gate 21A owns ordinary move selection from one current situation, not the
  longitudinal production journey that produced and later consumes that
  situation; and
- Gate 22 owns non-causal operational inspection and owner-native correction,
  not a record-to-answer causal claim.

The product-floor, zero-write, connected-durable, collision, intermittent-use,
and carrier/no-shadow cases are independent falsifiers of this one composition
claim. They remain separate evidence legs rather than new Gates or one giant
test. A failure reopens only the affected owner, producer/consumer seam, or
Gate 23 composition claim.

Decision ID `G23-BOUNDARY-001`.

## One released-v1 production spine

### Retained carrier convergence

The retained natural-language carriers are:

- the primary TUI in local/in-process mode;
- the primary TUI attached to the retained local server;
- direct non-interactive `repa run`, local or attached;
- attach/local-server clients using the retained Session API; and
- ACP prompt delivery over the retained local server.

Normal root input enters `session.start`. Exact current-work input enters
`session.steer`. These are two lifecycle paths, not interchangeable spellings
of one linear request:

```text
root input
-> session.start
-> SessionPrompt.start
-> SessionRunState.startTurn owns admitRoot and runTurnLoop
-> durable root Turn/Input/occurrence
-> zero or more exact model operations through LLM.plan/finalize and
   SessionProcessor
-> completed, failed, interrupted, or exhausted Turn truth

current-work input
-> session.steer validates the exact visible running owner and Turn
-> one process-local pending steer, not yet a learner occurrence or TurnInput
-> either typed rejection when the owner fails, interrupts, or terminalizes
-> or one safe promotion through TurnLifecycle.promoteSteer
-> durable learner_steer TurnInput plus InputPromoted event
-> membership in one specific later TurnModelOperation/request if sampling
   reaches that boundary
-> truthful completion or post-promotion planning, admission, provider,
   cancellation, or exhaustion failure
```

A busy later draft remains process-local until it is later admitted through
ordinary `session.start`. A pending steer is likewise not durable macro state
and earns no new unconsumed-steer owner. Carrier-specific editing, transport,
event synchronization, permission presentation, and rendering end before
model execution.

Every completed Tutor-move claim must bind the production ownership chain:

```text
carrier SDK call
-> released-v1 Session HTTP handler
-> root start ownership or an exact durable steer promotion
-> SessionPrompt.runTurnLoop owned by the root Turn
-> LLM.plan and exact Turn/Context admission
-> LLM.finalize
-> SessionProcessor and provider stream
-> durable Assistant/Tool/Turn terminal truth
```

A truthful failed or interrupted trace may end at any earlier named boundary;
it must not fabricate a provider request, completed move, or durable steer that
never occurred. For a promoted steer, shared Session/Turn identity is
insufficient: the evidence must join the promoted TurnInput and InputPromoted
event to the exact later TurnModelOperation `input_id`, admitted Context cut,
provider request when one opened, and terminal outcome. Rejection before
promotion must prove the absence of that durable steer input and later model
membership.

The default application layer and package build/startup registration, not file
existence or package export, determine reachability. The `@opencode/v2`
`SessionRunner` and `SessionExecution` source may remain for individually
reviewed typed-data or maintenance purposes, but the production Location graph
must contain no preview-runner edge and every mounted preview SessionExecution
binding must remain non-executing. Event-v2 projection, generated-v2 SDK types,
replay, import/export, and inspection are not model runtimes.

The no-shadow predicate is ownership-based: all interactive model execution
must remain below the released-v1 Session/Turn/Context/tool-terminal chain
above. AI SDK, native-provider, retry, and provider-specific stream
implementations selected inside the same `LLM`/`SessionProcessor` boundary are
not second Tutor runtimes merely because their transport code differs.

### Evidence admission

A Gate 23 product trace is admissible only when it begins through a retained
carrier or the same mounted production handler. A root trace must bind the
actual durable Session, Turn, root Input, learner occurrence,
Assistant/model operation, Context cut, Tool Parts, and terminal outcome. A
steer trace must additionally distinguish pending validation from durable
promotion and bind the exact promoted `learner_steer` Input to the specific
later model operation that consumed it. Merely sharing a Session or Turn cannot
prove steer consumption.

The following may prove a local seam but cannot establish the product loop:

- direct invocation of preview-v2 SessionRunner or SessionExecution;
- a Core-only Turn/Context construction that never enters SessionPrompt;
- caller-created Context JSON or renderer input;
- arbitrary SQL insertion of owner, Interaction, or inspection state;
- a constructed Message/Part passed directly to a TUI component;
- a fixture-only semantic branch or scripted oracle substituted for the
  ordinary Tutor; or
- a test-provider response asserted as model-quality evidence without a
  separately qualified real ordinary-Agent trace.

Typed owner setup is legal for an orthogonal collision precondition when the
test's claim begins after setup and independently verifies every required
producer state. It cannot supply provider-mediated authorship, a learner
outcome, or the connected durable trace by assertion.

Before Gate closure, one focused registration audit must inspect the default
build entrypoint, complete application/service graph, public route tree,
retained carrier calls, `SessionExecution` replacement, and production imports.
An absent import search or no-op binding alone is insufficient; their
composition must show no reachable preview or fallback model executor.

Decision ID `G23-SPINE-001`.

## Connected durable feedback trace

The smallest durable product trace uses one scoped `LearningStateJudgment` as
the representative owner-native consequence. This choice proves a real
longitudinal consumer without making learner-state memory mandatory after
teaching or promoting a response into mastery.

The trace must execute this sequence through the ordinary released-v1 Agent:

1. The Tutor performs a useful explanation, demonstration, guided step, or
   other concrete learning move against a real bounded subject.
2. The learner produces an exact response or report that identifies one
   bounded difficulty relevant to later teaching. Tutor prose, silence, task
   completion, or clock passage cannot substitute for that learner source.
3. In a later admitted model operation, the ordinary Agent may decide that the
   reported difficulty has durable value and issue the typed learner-state
   command. Runtime settlement binds the exact learner occurrence, model
   operation, invocation/receipt, source excerpt, revision, and current head.
4. A fresh Session receives only the bounded learner-state directory entry and
   other current Context; it imports no source transcript. If exact judgment
   detail can change the move, the Agent performs the authorized exact lazy
   read.
5. The later learner-visible action becomes a targeted repair, explanation,
   demonstration, or guided move materially different from the valid control
   action without that exact current revision.
6. A natural learner correction appends one exact-head successor while the old
   revision and old Context cut remain immutable.
7. The verdict-bearing post-correction consumer runs in a fresh Session whose
   request, system prompt, permitted non-owner Context, and provider setup do
   not contain the correction transcript or a compaction summary of it. The
   owner directory may identify the current successor and subject but does not
   contain the decisive corrected distinction; the required exact successor
   read is the only source of that source-discriminating fact. The later action
   changes where the contract predicts.

The positive trace must be paired with at least these controls:

- absent/withheld learner-state visibility cannot select the state-dependent
  branch;
- wrong, superseded, or stale revision detail cannot silently substitute for
  the exact current revision;
- an otherwise matched fresh-Session control that retains the predecessor as
  current or withholds the successor read must produce an action class
  incompatible with the successor-dependent positive action;
- storage order and one irrelevant owner perturbation do not change the action
  class;
- denial, abort, stale-head rejection, and transaction failure create no
  learner-state revision or fabricated later pressure; and
- a committed revision followed by provider failure remains committed, while
  the failed operation creates no completed Tutor move.

The action oracle accepts several useful wordings and move forms. It checks a
source-discriminating action predicate, exact current request, required lazy
read, forbidden state-management leakage, durable non-effects, and paired
owner-head change. Same-Session adaptation remains valid zero-write behavior
but cannot prove durable successor use. The trace does not score pedagogy or
require a hidden rationale, purpose enum, candidate rank, or database
causal-use edge.

Decision ID `G23-DURABLE-001`.

## Product-floor continuation

Gate 23 must separately prove that the product remains useful before or
without learner-state or advisory memory.

The product-floor trace starts from a fresh LearnerHome and executes:

```text
natural learner request with no pre-authored Course required
-> ordinary Gate 17 bootstrap only when useful
-> useful teaching in the same root Turn
-> exact Course/View/material/navigation and Interaction truth when created,
   including one source-discriminating unfinished example, question, route
   choice, or material fact available only in exact prior Interaction detail
-> a fresh Session with a natural generic continuation request
-> bounded route/recent-Interaction directory plus other small current state
-> required exact lazy Interaction read for the discriminating prior fact
-> a continuation action that is valid only for that exact current fact,
   without old-transcript import
```

The discriminating prior fact is absent from the fresh request, system prompt,
automatic Course/route summaries, and every unrelated owner contribution. Its
positive continuation must therefore bind the current cut/directory and exact
authorized Interaction read. A generic explanation, study suggestion, or
other broadly useful answer that would also be valid without the prior fact
cannot satisfy this trace.

An otherwise matched control with that locator/read withheld, unavailable, or
bound to a changed current route/material truth must not produce the positive
action class. It must instead make a different valid move or ask the smallest
learning-level clarification. The positive and control requests remain the
same; storage order and unrelated owner state do not choose the result.

The fresh Session must not receive the old Session's Message/Part bodies or
compaction summary automatically, replay the old transcript, infer progress
because a Turn completed, or require an internal ID/state-management exchange.
An absent, deleted, omitted, source-unavailable, or over-budget locator remains
truthful and cannot be reconstructed from current owner state.

This trace does not require the system to create a learner-state judgment,
evidence record, Goal, Assignment, FutureAttention concern, or advisory
suggestion. A direct learner question may remain zero-write beyond ordinary
Interaction truth.

Decision ID `G23-FLOOR-001`.

## Zero-write learner feedback

A separate same-Session trace proves that immediate feedback does not need a
durable learning-domain consequence:

```text
Tutor explanation or demonstration
-> learner says it did not help, corrects the framing, or asks for another form
-> the next peer teaching move materially changes
```

The learner input must enter the released-v1 Session/Turn spine and the next
provider request through ordinary same-Session conversation history. The
result may explain differently, demonstrate, compare, guide work, or ask one
useful question. It must not force a quiz, learner-state write, advisory write,
or progress update merely to make the feedback measurable.

Before and after the trace, every learning-domain effect/revision/seal count and
the shared learning frontier must remain unchanged. Only legal Interaction,
Turn, model-operation, and presentation state may advance. A real ordinary
Agent trace establishes the semantic move change; deterministic request
capture and owner digests establish delivery and no-write truth.

Decision ID `G23-ZERO-001`.

## Longitudinal collision and intermittent use

### Representative collision

One fresh-Session `continue` trace begins from a production-valid bounded state
containing all still-admitted representative pressures:

- Course, eligible View/Revision, navigation preference/anchor;
- nonempty Material Map/alignment state;
- Goal;
- due/open FutureAttention;
- open Assignment;
- active fuzzy learner-state judgment;
- active advisory suggestion;
- retained steering;
- recent terminal Interaction; and
- nonempty Gate-19-admitted learner-response evidence where its source and
  material collision conditions are legal.

Every setup record retains its actual source, current head, lifecycle, and
omission truth. The setup may use typed production owner transitions without
provider calls because this leg tests composition after those producers; it
must not use arbitrary SQL or claim that synthetic setup is a learner journey.

The ordinary Tutor must reach one useful teaching, guided-work, review,
planning-advice, or real-work move without asking the learner to select an
owner, record, internal ID, or state-management menu. One paired genuinely
unsafe ambiguity must produce exactly one concise learner-visible
clarification and no premature solving or owner mutation. Several pressures
may jointly shape the move; no winning-row field is required.

Gate 21A remains the owner of current move selection and failure re-entry.
Gate 23 verifies that the accepted selector consumes the longitudinally
composed product state; it does not reopen the selector mechanism unless this
integrated collision exposes a causal failure that survives repair of context,
tool, prompt, or evidence setup.

### Intermittent-use leg

From a retained collision/suggestion state, trusted time passes while Repa is
not active and the learner may have learned elsewhere. At the next wake/read:

- the clock derives only owner-defined due/overdue/age relations;
- no background event or read creates activity, non-activity, progress,
  adherence, acceptance, breach, mastery, completion, cancellation,
  abandonment, or learner-state decay;
- old advice remains exact historical advice even when its usefulness is now
  uncertain; and
- the Tutor asks at most the smallest outcome-relevant question whose possible
  answers materially change the next move.

A natural learner report may correct the exact learner-state judgment or
advisory suggestion through its existing owner command. The correction must
create an exact successor, preserve the predecessor, and leave unrelated Goal,
Assignment, Course, evidence, FutureAttention, and Interaction meanings
unchanged. The verdict-bearing successor consumer then runs in a fresh Session
that excludes the correction transcript and compaction summary. Its directory
may identify the current successor but not the decisive corrected distinction;
the exact successor read is the only model-visible source of that fact. A
matched predecessor-current or successor-withheld control must produce an
incompatible action class; the positive later move must change where
predicted. Same-Session acknowledgement or adaptation cannot support this
durable-consumption claim. The learner need not reconstruct missed days or
settle an activity ledger.

Decision ID `G23-LONGITUDINAL-001`.

## Failure, interruption, and truthful partial results

Gate 23 composes rather than duplicates the accepted Turn, command, Context,
and owner failure contracts. Evidence must still show their product-loop
consequence on the current candidate:

| Boundary | Required result |
| --- | --- |
| provider failure before a completed Assistant | preserve admitted learner input and exact Context/model operation; fail the operation/Turn; create no completed Tutor move or owner effect |
| owner command rejected, denied, aborted, stale, or transaction-failed | preserve the original occurrence and Interaction; create no revision/effect/receipt that the failure did not commit; later re-read and choose again |
| owner command committed before later provider failure | preserve the exact committed revision and typed acknowledgement; later fresh operation may consume it; failure invents no extra effect |
| learner cancellation or ancestor interruption | terminalize exact running work without a completed move, hidden continuation, or retargeted draft |
| pending steer loses its owner before promotion | reject it with exact active/terminal truth; create no durable learner_steer TurnInput, InputPromoted event, model membership, or completed move |
| promoted steer reaches later failure | preserve the durable promoted Input and bind it only to any exact later model operation actually admitted; planning/admission/provider failure invents no successful request or completed steer-conditioned move |
| process loss/startup recovery | close orphaned work from durable truth before accepting new work; perform zero provider redispatch for the orphan; later distinct input receives a new cut |
| compaction | summarize only the selected old prefix; retain a recent verbatim tail and original transcript; give the summary no learning authority; admit a fresh cut for later interactive work |
| source/Session deletion | preserve only surviving owner-native source truth and allowed Interaction tombstones/audit; never reconstruct deleted bodies or causal attribution |
| model/tool budget exhaustion | terminate truthfully and retain exact continuation/exhaustion identity; do not hide a reset, fallback runner, or new causal occurrence |

Accepted Gate 18 and Gate 21A evidence may remain decisive where exact code and
dependency reach have not changed. Gate 23 must rebind the directly affected
request, Context, processor, compaction, carrier, and inspection seams to the
current integrated candidate and rerun only checks whose result can change the
product-loop verdict. It must not demand a broad suite merely to reproduce
green counts.

Decision ID `G23-FAILURE-001`.

## Acceptance evidence architecture

### Deterministic production-path evidence

Deterministic checks must establish facts that model prose cannot prove:

- exact baseline/working-package identity and no concurrent target writer;
- retained carrier endpoint and default startup/service-graph convergence;
- absence of a reachable preview/fallback model executor;
- exact root Session/Turn/Input/occurrence/model/tool/Context/terminal identities;
- process-local pending-steer rejection versus durable learner_steer promotion,
  the InputPromoted event, and exact promoted-Input-to-later-model-operation
  membership without Session/Turn-only inference;
- exact owner command, effect, revision, predecessor/current-head, and receipt
  settlement;
- old-cut and old-revision immutability across correction;
- current-cut projection, omission, directory/lazy-read, and capability truth;
- fresh-Session isolation for every verdict-bearing durable-successor consumer,
  excluding the source correction transcript and compaction summary and
  proving that no recent-Interaction locator/read, Session summary, or other
  provider-visible input supplies the decisive correction fact;
- source-discriminating positive/action predicates plus otherwise matched
  stale/withheld/changed-current controls for the product-floor and durable
  successor legs;
- fresh-Session exclusion of old transcript bodies and same-Session inclusion
  of the exact learner conversation;
- owner-table/frontier non-effects for zero-write, failure, time passage, and
  irrelevant perturbations;
- no automatic activity, progress, adherence, Assignment, FutureAttention,
  learner-state, advisory, or mastery transition; and
- exact persisted Parts passing through the primary-TUI production decoder and
  component where learner-visible settlement or inspection truth is claimed.

Scripted providers may prove request ordering, exact tool use, deterministic
counterfactual plumbing, failure injection, and no-write behavior. A
fixture-specific semantic oracle cannot establish ordinary Tutor behavior.

### Bounded real-provider qualification

At least the connected durable, product-floor, zero-write, and representative
collision/intermittent semantic moves require one bounded current-candidate
qualification through the ordinary released-v1 Agent and provider path. The
qualification:

- uses an explicitly authorized current configured provider/model and request
  ceiling;
- starts from immutable per-phase database/checkpoint manifests;
- keeps each product-floor and durable-successor positive/control pair matched
  in current request and all non-challenged model inputs, places the decisive
  fact only in the admitted current cut or exact lazy read, and rejects a
  generic useful answer as evidence of consumption;
- uses a fresh Session for durable-successor verdicts so same-Session
  conversation cannot supply the corrected fact independently, and captures
  the complete normalized provider request plus exact lazy-read Tool results
  to prove that no alternate Interaction or summary path supplies it;
- uses the primary natural-language carrier for the longitudinal product
  traces and reuses deterministic carrier convergence for the other retained
  carriers unless a carrier-specific semantic divergence appears;
- records provider requests, retries/tool continuations, Turn outcomes,
  source-discriminating action classes, exact required lazy reads, and available
  usage/cost fields without inventing absent cost;
- redacts credentials, account identity, authorization values, and other
  secrets at source-audited slots and scans the final bundle; and
- accepts multiple useful wordings while rejecting internal state management,
  false progress/activity/adherence/mastery, missing required read, wrong
  successor, and contradictory action classes.

Provider access, credentials, or paid calls require their own explicit
authorization at execution time. Lack of that authority pauses Gate 23 before
the real-provider evidence; deterministic traces cannot silently replace it.
The result qualifies one bounded product composition, not model reliability,
pedagogical optimality, educational efficacy, account billing, or release
readiness.

### Evidence binding and retention

Every verdict-bearing phase records before execution:

- contract digest, baseline or exact candidate/package identity, runner/test
  digest, runtime/package/migration versions, and starting database digest;
- exact Session/Turn/Input/occurrence/Assistant/Context/tool identities needed
  for the phase;
- expected authority scope and which state is fixture setup versus a produced
  learner journey; and
- containment, request ceiling, redaction policy, and terminal stopping rule.

The result binds the database, normalized/redacted provider request captures,
application log, structured phase result, relevant rendered TUI output, and
their relative paths, byte lengths, and digests. It distinguishes stored,
independently derived, model-authored, and unavailable values. A runner or
oracle mutation invalidates only dependent phases and requires a new
pre-manifest; it cannot retroactively repair evidence.

### Cross-Gate composition audit

Before closure, inspect active production owners and reachable call paths only
far enough to answer:

- does another reachable implementation own an accepted learning identity,
  transition, correction, Context, or model-execution invariant;
- does any new or inherited path bypass Gate 8 settlement, Gate 12 Turn truth,
  Gate 18 Context admission, Gate 21A ordinary-Agent selection, or Gate 22
  owner-native inspection/correction;
- did an earlier correction leave a fallback, stale registration, or test-only
  path able to support a false product claim; and
- are retained preview/data/event projections still non-executing where the
  baseline requires.

This is not exhaustive function deduplication, release readiness, or a source
deletion target. Findings reopen only their affected owner or Gate 23 evidence.

Decision ID `G23-EVIDENCE-001`.

## Reuse disposition

### Reuse unchanged

- released-v1 SessionPrompt, SessionRunState, TurnLifecycle, SessionProcessor,
  LLM planning/finalization, provider, tool, permission, compaction,
  cancellation, recovery, HTTP, TUI, direct-run, attach, and ACP mechanics;
- Gate 8 physical/semantic settlement and owner-native command transactions;
- Gate 18 immutable bounded Context, honest omission, capability binding,
  recent-Interaction locators, and lazy owner reads;
- the independent Course/navigation, Goal, FutureAttention, Assignment,
  learner-response-evidence, learner-state-judgment, advisory-suggestion,
  retained-steering, Material, and Interaction authorities;
- Gate 21A ordinary-Agent move selection and re-entry; and
- Gate 22 non-causal primary-TUI inspection/correction.

### Adapt only if a trace exposes a surviving seam

- existing production SessionPrompt tests and provider harnesses may be
  extended into longitudinal phases;
- existing evidence manifests may be adapted to identify fixture setup versus
  learner-journey production and to bind current Gate 22-integrated source;
- one existing prompt, Context, tool, or carrier seam may be repaired when a
  causal trace proves it blocks the accepted loop; and
- owner-native behavior may be corrected only through the owning Gate/contract
  if the evidence falsifies an accepted invariant.

### Refuse

- preview-v2 SessionRunner or hibernated SessionExecution as Gate 23 runtime;
- a new product-loop manager, workflow engine, or orchestration service;
- a universal activity/outcome/consumption/causality table;
- a durable Tutor-move, selected-winner, active-purpose, or rationale record;
- a mandatory preliminary selector/classifier/model call;
- automatic learner-state aggregation, mastery, decay, or progress; and
- a single opaque runner that creates every owner, exercises every carrier and
  failure, and judges all semantics in one pass.

Decision ID `G23-REUSE-001`.

## Explicit exclusions

Gate 23 does not own or claim:

- a new domain schema or universal record family;
- per-record causal attribution to a Tutor answer;
- one physical input carrier or shell/admin execution as the Tutor UI;
- release packaging, supported-platform qualification, updater/CI, migration
  support beyond source actually affected by an implementation repair, or
  broad release readiness;
- general provider/model reliability, provider comparison, or cost claims;
- pedagogical uniqueness, optimality, educational efficacy, mastery, or
  long-term learner outcome;
- a background daemon, activity/adherence ledger, daily reconstruction, or
  inference from silence/absence;
- a global scheduler, allocation/feasibility authority, universal agenda,
  fixed teaching workflow, or pedagogy taxonomy;
- routine learner management of internal Course, Goal, Assignment,
  learner-state, advisory, Context, or Interaction records;
- selective cross-authority deep deletion or any recorded post-baseline
  capability; or
- commit, push, publication, integration, release, or the next Gate.

Decision ID `G23-NONOWN-001`.

## Implementation boundary

Implementation begins only after fresh independent acceptance of this
contract/theory layer. The first implementation is evidence-first:

1. rebind the candidate and phase manifests to the accepted contract and
   current `origin/main` descendant;
2. reuse the released-v1 product spine and existing owner commands/reads;
3. add focused deterministic and bounded real-provider product traces;
4. repair production behavior only when one admitted trace exposes a causal
   failure; and
5. update the implementation/evidence record and current status truth without
   committing, integrating, publishing, or releasing.

No production-code change is required merely because Gate 23 is a numbered
Gate. A trace-only implementation/evidence candidate is legitimate if current
production behavior already satisfies the contract and its evidence is
causally adequate. Conversely, a local patch is insufficient when it preserves
a shadow path, missing producer/consumer handoff, false activity inference, or
wrong owner. Any proposed new domain lifecycle, controller, hard-limit change,
second runtime, release claim, or product trade-off reopens this contract or
its owning product/roadmap decision before implementation continues.

## Review and current disposition

Fresh top-level reviewer task `01a02d7f-8926-7562-82c3-06d2fadb1143`
reviewed the first 28,997-byte contract candidate at SHA-256
`8BB30C00596669BF4A5BA8FA0D7FB15B913F76094E5F5FE95B55EB5BC3B85C0D`
under Whole-Gate run `G23-WG-20260823-5F9B9860-01` and returned **Revise**
with three High acceptance-changing findings and no owner blocker:

- `G23-CR-001`: the product-floor trace could accept a generic useful answer
  without consuming any prior Course/route/material/Interaction fact. The
  successor now isolates one source-discriminating fact in exact prior
  Interaction detail, requires its cut-bound read, and requires a matched
  withheld/unavailable/changed-current control with an incompatible action.
- `G23-CR-002`: same-Session correction history could explain a changed action
  even when the owner successor was included and read. The successor now puts
  every verdict-bearing durable-correction and intermittent successor consumer
  in a fresh Session without the correction transcript or compaction summary,
  and changes only the exact owner head/read across the paired control.
- `G23-CR-003`: the first candidate linearized root start and process-local
  steer. The successor now separates root ownership from pending steer,
  rejection, durable promotion, exact later model-operation membership, and
  post-promotion failure, while defining no-shadow at the released-v1
  Session/Turn/Context/tool-terminal ownership boundary.

The same reviewer closed all three findings on the repaired candidate, found no
related regression or replacement finding, and returned `Accept` for the
contract/theory layer. Its later implementation/evidence closure pass closed
`G23-IR-001..003`, found no replacement or new finding, owner blocker, or
material acceptance-changing unknown, and returned `Accept` for both the
implementation/evidence layer and Whole Gate. The reviewer is retired after
this Gate and must not be reused.

At this candidate cut:

- Gate 22 is accepted, integrated, and published on `origin/main`;
- Gate 23 local opening/design/evidence grill is complete;
- the Gate 23 contract/theory layer is accepted;
- `G23-CR-001..003` are closed with no replacement finding, owner blocker, or
  material contract-layer unknown;
- the first implementation/evidence pass returned `Revise` for
  `G23-IR-001..003`, and the closure pass closed all three with no replacement
  finding, contract reopen, or owner blocker;
- the accepted 16-path implementation/test/runner working-tree package is
  1,243,728 bytes at
  canonical manifest
  `243538E5280C8E0937C53BD3F2855CCB7D3CFB2D3FA82A79539D637EE5E4B572`;
- local implementation commit
  `db3ae0c80068a4f574de687edca18075fbdc1bc8` carries the behavior-equivalent
  16-path / 1,230,882-byte commit-tree package at manifest
  `CABB42A293E0C4EB74AD6976E45067739DDC5FACE46DC0DE241B2A9BABCCE024`;
- focused deterministic evidence and bounded `openai/gpt-5.6-luna`
  product-floor, durable/corrected, zero-write, collision/ambiguity, and
  intermittent-use phases pass through the primary-TUI SDK/mounted-handler
  boundary with matched controls and retained diagnostics;
- both required Gate layers and the Whole Gate are accepted and locally
  integrated; and
- no push, publication, release, or next-Gate claim follows.
