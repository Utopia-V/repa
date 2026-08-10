# Repa Gate 21: advisory learning-plan suggestions

Status: **Contract/theory candidate only. Fresh independent review has not
begun.** This candidate supersedes the unreviewed
[2026-08-08 deterministic Planning candidate](repa-gate-21-cross-day-planning-authority-2026-08-08.md).
It is not implementation, migration, integration, release, or Gate 21A
authority.

Date: 2026-08-09

Exact predecessor integration: feature branch
`codex/gate-20a-assignment-authority` contains accepted Gate 20A implementation
commit `5099ecc642390cf7bae0f980098edd5267a75874` and accepted Gate 20B
implementation commit `b040518591a2f065aec9b82214496a113c81ed35`, each followed
by its documentation status successor. `main` and `origin/main` remain
`c100b431fe174d1993b2baa89a7d1b133300b579`. Existing maintainer edits in
`AGENTS.md` are preserved; this Gate 21 candidate changes no production package.

Review run reserved for fresh dispatch:
**`G21-WG-20260810-019fe065-01`**. Gate 20B contract/theory and
implementation/evidence are accepted and published on the feature branch, so
this candidate may bind its exact
learner-state judgment handoff and proceed to a fresh independent review. A suggestion may still arise directly from the current
learner occurrence, Goal, Assignment, Course, material, or evidence without a
stored learner-state judgment. Gate 20B and Gate 21 remain separate acceptance
units and require separate fresh top-level reviewers.

Authority and correction routing:
[product origin](../foundation/00-product-origin.md),
[ADR-0003](../decisions/0003-learning-state-follows-evidence.md),
[ADR-0008](../decisions/0008-model-write-initiative-and-durable-authority.md),
[ADR-0009](../decisions/0009-separate-invocation-and-semantic-effect-identity.md),
[ADR-0012](../decisions/0012-learning-centered-modular-monolith.md),
[ADR-0013](../decisions/0013-conditional-current-purpose-composition.md),
[system architecture](../architecture/00-system-architecture.md),
[native learning data model](../architecture/01-native-learning-data-model.md),
and [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md).

Material predecessors:
[Gate 8 learning-command settlement](opencode-fork-gate-08-learning-command-settlement-2026-07-16.md),
[Gate 12 durable Turn lifecycle](opencode-fork-gate-12-durable-turn-lifecycle-2026-07-18.md),
[Gate 16 Goal authority](opencode-fork-gate-16-learner-goal-authority-2026-07-21.md),
[Gate 18 LearningContext](repa-gate-18-learning-context-session-continuation-2026-08-03.md),
[Gate 20A Assignment authority](repa-gate-20a-assignment-authority-2026-08-08.md),
and the accepted Gate 20B learner-state judgment handoff.

Historical research:
[2026-08-08 cross-day arithmetic experiment](repa-gate-21-cross-day-planning-boundary-experiment-2026-08-08.md).
Its Assignment split, exact-cut, correction, and no-inferred-activity findings
remain useful. Its max-flow kernel is optional research, not this Gate's
production owner or dependency.

## Parent learning outcome

Repa should help a learner decide how to proceed across more than the immediate
Turn without becoming a rigid planner. The ordinary Tutor may suggest a useful
learning direction, make the near term concrete, leave the farther horizon
coarse, remember that suggestion across Sessions, and revise it naturally when
the learner says it is unsuitable or when relevant facts change.

The point is helping the learner learn, not mechanically closing tasks,
occupying available time, or meeting a schedule metric. A suggestion may take
deadlines, Goals, Assignments, current understanding, materials, and available
time into account, but the ordinary model and learner retain the fuzzy local
judgment. The program supplies durable identity, provenance, exact references,
correction, permissions, recovery, bounded injection, and tool calls. It does
not certify one plan as optimal, feasible, accepted, or pedagogically correct.

## Gate claim

Within one LearnerHome, Gate 21 owns stable identities and immutable revisions
for multiple scoped advisory learning-plan suggestions. Each suggestion is a
bounded semantic artifact authored by the ordinary Tutor/model or learner. It
can arise responsively from the current conversation or be offered proactively
when useful, provided it does not displace the teaching move the learner is
currently seeking.

Every revision preserves:

- one learner-visible purpose and scope;
- one bounded open-language suggestion body;
- author, causal occurrence/model operation, and exact LearningContext cut;
- optional exact references to Goals, Assignments, Courses, materials,
  evidence, learner-state judgments, and other admitted owner revisions;
- stated assumptions, uncertainty, and approximate temporal meaning when used;
  and
- immutable predecessor, correction, disposition, and settlement truth.

The current LearningContext contains only a bounded directory of relevant
active suggestions and exact omission/currentness truth. The ordinary Agent
lazy-loads full bodies and exact producer details only when the current move
needs them. Natural-language learner feedback appends a successor; there is no
special plan-approval state or mandatory confirmation ceremony.

The Gate closes only when an ordinary released-v1 Tutor actually consumes an
exact suggestion in a fresh Session and a natural correction changes a later
learning move. A database row or system-prompt mention alone is insufficient.

## First-principles boundary

An advisory suggestion is useful because three facts can coexist:

1. models increasingly make competent contextual proposals but remain
   fallible;
2. learners can recognize many unsuitable local proposals and ask for a
   revision naturally; and
3. the runtime can preserve exact identity, source, time, revision, permission,
   settlement, recovery, and later delivery without pretending to solve the
   pedagogical judgment itself.

Moving the third responsibility into model prose loses cross-Session identity,
correction, and recovery. Moving the first two into deterministic scheduling
creates false precision and interrupts teaching. This Gate therefore owns the
durable advice artifact and its computational substrate, not a planner's
objective function.

## Closed vocabulary and non-equations

```text
plan suggestion != authoritative schedule
plan suggestion != learner commitment, acceptance, or promise
plan suggestion != activity, adherence, progress, or evidence of learning
plan suggestion != Goal or Assignment lifecycle
plan suggestion != Tutor move
deadline reference != program-owned priority
learner-state judgment != remaining-work estimate
elapsed suggested block != completed work or learned amount
silence != approval or successful execution
multiple active suggestions != one hidden global plan
program-valid revision != pedagogically correct advice
```

The owner is named by its meaning: advisory learning-plan suggestion. `Planning`
may remain a family/composition term in historical documents, but it is not a
singleton scheduler authority or universal Agenda owner.

## Multiple scoped identities and complete revisions

The physical schema and module names are implementation choices. The logical
contract is equivalent to:

```text
LearningPlanSuggestion {
  suggestionID
  learnerHomeID
  createdBy
  headRevisionID
}

LearningPlanSuggestionRevision {
  suggestionID
  revisionID
  version
  predecessorRevisionID?
  disposition: active | retired
  scope
  purpose
  body
  authorAndCause
  exactBasisRefs[]
  assumptionsAndUncertainty?
  recordedAt
  correctionOf?
  alternativeToSuggestionID?
}
```

There is no singleton LearnerHome portfolio. Several active suggestions may
coexist for different Courses, Goals, Assignments, time horizons, learning
strategies, or genuine alternatives. The runtime must not rank them or silently
promote one into “the plan.”

One stable identity represents one continuing advisory proposal. Revising its
details, sequence, emphasis, or horizon appends a successor. A materially
different purpose or a deliberate alternative creates a new identity and may
reference the other suggestion. The ordinary Agent proposes same-versus-new;
the learner can correct that interpretation. The program owns exact heads and
relations, not semantic equivalence.

Every revision is a complete immutable snapshot. An old revision keeps its
exact body and exact producer references after any Goal, Assignment, Course,
evidence, or learner-state correction. Fresh reads report currentness and drift
separately. Nothing silently retargets an old suggestion.

Retirement only removes a suggestion from the current advisory directory. It
does not mean the learner rejected it, failed to follow it, completed it,
abandoned a Goal, cancelled an Assignment, or stopped learning. Restoration
appends an active successor.

## Open semantic body and rolling granularity

The suggestion body is a bounded, versioned semantic document. It may include
an explanation of trade-offs, a near-term sequence, example learning blocks,
review checkpoints, materials to use, questions to resolve, and a coarse later
direction. The runtime treats this as authored semantic content; it validates
encoding, size, identity, exact references, and settlement, not pedagogy or
schedule correctness.

The preferred product shape is rolling:

- the next move or short horizon may be concrete enough to act on now;
- later days or weeks may remain goals, themes, checkpoints, or alternatives;
- new understanding, learner feedback, deadline changes, or outside learning
  can revise the future without reconstructing an adherence ledger; and
- a suggestion need not enumerate every day, fill every available minute, or
  produce a canonical allocation.

No fixed schema for “day,” “block,” priority, percentage complete, remaining
minutes, feasibility, or workload is required. If the author uses such values,
they remain source-bearing assumptions in the suggestion unless an independent
accepted owner exists.

## Exact references, fuzzy judgments, and deadline meaning

A suggestion can cite a closed tagged set of exact owner references, including:

- the current learner occurrence, Turn, and authoring model operation;
- exact Goal revision and immutable target basis;
- exact Assignment revision and immutable due/expiry/source basis;
- exact Course/View/item, Artifact/Representation/MaterialMap selector;
- exact Gate 19 evidence revision;
- exact Gate 20B learner-state judgment revision; and
- another exact suggestion revision when revising or presenting an alternative.

The cited owner retains its meaning. A Goal target or Assignment due boundary
is not copied into suggestion authority. A fresh read may derive before/on/after
or due/overdue relation from the exact boundary, trusted clock, and current cut.
The old suggestion remains byte-identical after clock passage or producer head
advance.

If the learner reports an approximate deadline that has not earned a Goal or
Assignment record, the suggestion may retain that bounded statement and exact
learner occurrence as an approximate assumption. It must not render it as an
owner-certified deadline. This lets the Tutor remember that a deadline is
roughly approaching without forcing every mention into a new domain record.

Learner-state judgments remain fuzzy. A suggestion may cite “application still
uncertain” as one exact authored judgment, but it cannot translate the judgment
into a deterministic remaining-work amount or claim that elapsed study changed
mastery.

## Authorship and semantic causes

A new suggestion or correction has one admitted cause:

1. **responsive Tutor proposal** — an exact learner occurrence requests or
   clearly invites planning advice; the root model operation and exact context
   cut author the body;
2. **non-disruptive proactive Tutor proposal** — the ordinary root Agent judges
   that a bounded suggestion would help, authors it from an exact cut, and does
   not replace the explanation, demonstration, guided work, or answer the
   learner currently needs;
3. **learner revision** — an exact learner occurrence says the current advice
   is unsuitable or requests a different emphasis, pace, order, material, or
   horizon; and
4. **Tutor revision** — an exact later model operation, current cut, and cited
   changed owner facts support an updated proposal.

The runtime proves the cause and exact references exist and are authorized. It
does not prove that the model's interpretation follows logically from natural
language or that the advice is good. Generic model prose or a plan-mode Markdown
file is not durable suggestion truth until the typed command settles.

## Natural revision, no plan-approval state

Ordinary interaction is the correction surface:

```text
Tutor: For the next few sessions, I suggest reviewing the invariant first,
       then trying one guided proof before returning to the implementation.
Learner: That is too theoretical. Give me a concrete example first and shorten
         the review part.
Tutor: ...commits a successor suggestion and teaches from the new emphasis...
```

The learner need not inspect IDs, enter a plan editor, or approve a proposal
before Repa can remember it. An `active` suggestion means available current
advice, not learner assent. Silence does not upgrade it to accepted. The
ordinary permission system still applies, and retained carriers show a truthful
settlement result; “no special approval ceremony” is not permission bypass.

## Commands, settlement, and recovery

Gate 21 reuses the Gate 8 semantic-command path, Gate 12 Turn/Session/model
operation identities, the existing tool registry and permission catalog, and
startup recovery. It adds no scheduler process, background daemon, second Agent
loop, second database, prompt-only write path, or plan-mode runtime.

The logical mutations are:

- create a scoped suggestion with a generated stable identity;
- revise or directly correct one exact current suggestion head;
- create a deliberate alternative linked to an exact revision;
- retire one exact current head; and
- restore one exact retired head.

An implementation may combine these into the existing closed change-set shape
when atomic multi-intent settlement is already mature. Separate operation names
must correspond to different legal transitions rather than imagined workflow
stages.

Every write binds causal occurrence/model operation, physical invocation,
semantic effect address, expected current head, author, exact source refs,
capability, permission, domain revision, receipt, and terminal Tool settlement.
Exact replay returns stored truth. Identical semantic reuse is already applied
or no-change; changed reuse conflicts. Stale heads and source races fail without
partial writes. Recovery reconciles durable domain/effect/receipt/Tool truth
without blind model or tool redispatch.

Initial mutation authority is the ordinary interactive root Tutor Agent.
Restricted, child, and delegated Agents are default-deny for writes unless a
later accepted boundary earns narrower authority. Authorized reads follow the
Gate 18 operation-specific capability projection. A hidden suggestion cannot
leak identity, count, or content to an operation without that owner capability.

## Bounded Context index and lazy reads

Gate 21 adopts the existing Gate 18 computational substrate:

```text
exact owner/current snapshot
-> immutable operation-specific cut
-> bounded advisory-suggestion directory
-> authorized provider-visible lazy read
-> exact detail only when useful to the current move
```

The automatic eligible set contains active current suggestions whose exact
scope anchors intersect exact Course, Goal, Assignment, material, or
learner-state owners already in the operation's Context, plus explicitly
LearnerHome-wide suggestions. It does not use request keywords, embeddings,
deadline rank, hidden model calls, static priority, or first-row selection.

Within Gate 18's current owner-contribution limit, at most eight compact entries
are included in stable identity-creation order. Each entry contains suggestion
and revision locators, learner-visible purpose/scope, author class, exact anchor
kinds, a short summary, active/current/stale relation, temporal/source caveats,
and lazy-read availability. It does not include the full body, full source
graph, or history. Multiple entries remain alternatives/constraints, not an
ordered Tutor policy.

The cut binds pre-truncation count, retained count, candidate-limit omission,
byte-budget omission, exact owner dependencies, and effective read capability.
Every compact entry fits Gate 18's existing 2,048-byte semantic-value ceiling.
If more suggestions exist, exact omission and a bounded cursor-stable discover
read let the ordinary Agent expand the directory. Withheld capability returns
explicit not-authorized truth and reveals neither hidden identities nor counts.

This is a deliberate on-demand loading strategy. Like the resource discipline
behind greedy or dynamic-programming techniques, the system keeps a small
decision frontier and expands only state that can affect the current move. It
does not claim that the host can greedily optimize pedagogy or that a
deterministic relevance score chooses the right suggestion.

Reads distinguish exact pinned revision, current head, bounded discovery at an
exact `asOf`/dependency cut, and revision history. They are zero-write. Cursor
resume preserves the old cut or returns typed stale truth; it never joins a
later Goal, Assignment, Course, source, evidence, or learner-state revision into
an old page. Provider retry and an admitted model operation keep the same cut.

## Proactive advice without interrupting teaching

The ordinary Agent may offer a plan suggestion when the current situation
would benefit from one. That permission is not an instruction to turn every
learning request into planning or to insert a state-management exchange before
teaching.

Provider-visible semantics and evidence must preserve these cases:

- a learner asking “explain this proof” receives an explanation; the Agent does
  not first demand a schedule;
- after a useful explanation, the Agent may briefly offer and durably retain a
  follow-up learning direction when it materially helps;
- a learner explicitly asking for a study approach can receive advice and a
  durable suggestion in the same ordinary loop;
- a useful local answer can finish with no suggestion write; and
- a stale or unsuitable suggestion can be ignored or revised while teaching
  continues.

No host keyword classifier determines which case applies. The ordinary Agent
uses its exact request, bounded Context, and lazy reads. A later causal failure
may justify a narrower mechanism; no speculative selector enters this Gate.

## Intermittent and non-exclusive use

Repa may be closed while the learner studies elsewhere. Therefore:

- clock passage writes nothing;
- elapsed suggested steps do not imply activity or non-activity;
- silence does not imply approval, adherence, breach, abandonment, or failure;
- Assignment completion does not prove learning or suggestion completion;
- learner-state does not decay automatically; and
- an old suggestion remains exact historical advice even when it is no longer
  useful as current guidance.

On re-entry, the ordinary Tutor sees a bounded index, retrieves exact detail
only when needed, and asks at most the smallest outcome-relevant question. It
may revise the future direction from a learner report or changed exact owner
fact. It does not ask the learner to reconstruct every day or settle an
adherence ledger.

Fresh reads report independent currentness axes: suggestion head, cited Goal or
Assignment head, cited source availability, cited learner-state/evidence head,
and trusted-time relation. Drift does not mutate or automatically retire the
suggestion. A new semantic command is required for a successor.

## Earned consumers and causal evidence

### Responsive creation and teaching trace

The learner asks for help approaching two learning pressures. The ordinary
Tutor uses exact current request plus optional Goal/Assignment/learner-state
reads, offers a scoped rolling suggestion, commits it through the typed command,
and still performs a real explanation, demonstration, or guided-work move in
the same interaction. The trace fails if the Agent merely administers tasks.

### Fresh-Session continuation trace

Session A creates suggestion S1 and ends. Session B imports no transcript. Its
exact LearningContext exposes the compact suggestion index; under a request to
continue, the ordinary Tutor lazy-reads S1 and the exact cited learning-state or
deadline source it actually needs, then starts a move consistent with the
near-term advice. Evidence must bind S1 revision -> Context cut -> lazy read ->
model operation -> learning move.

### Natural correction trace

The learner says the advice is too theoretical, too intense, poorly ordered, or
otherwise unsuitable. The root Agent appends S2 against exact S1, preserving
the learner occurrence and unchanged source refs. A fresh Session/cut consumes
S2 and begins a materially different teaching or guided-work move. No explicit
accept/reject plan state is introduced.

### Changed learner-state trace

Hold the request, Goal/Assignment, and suggestion identity fixed. A source-bearing
Gate 20B correction changes the learner's currently recorded gap. The Agent
reads that exact successor and revises the advice rather than deterministically
recomputing minutes. The new suggestion's changed content and later learning
move must be causally visible.

### Non-disruptive and zero-write traces

An explicit explanation request receives teaching without a planning detour.
Another helpful interaction finishes with no suggestion write. Gate 21 fails if
planning becomes the mandatory center of the product.

These traces prove a real consumer and correction path. They do not prove that
the suggestion is objectively optimal or educationally effective. General
collision arbitration remains Gate 21A.

## Failure and correction matrix

| Situation | Truth-preserving result |
| --- | --- |
| model's suggestion is pedagogically weak | keep source-bearing authorship; learner/Tutor may revise or retire it; runtime never certifies it |
| learner gives natural correction | append one complete successor under exact-head CAS; no approval state or mutation of old body |
| cited Goal/Assignment/learner-state head advances | old revision remains exact; fresh projection reports drift; no automatic retarget |
| approximate deadline later proves wrong | preserve old authored assumption; cite exact correction or owner revision in a successor |
| several active suggestions coexist | expose bounded directory and omission; do not select/rank one as global plan |
| permission denied or prompt aborted | no suggestion/effect; exact terminal settlement |
| crash after admission or commit | recover domain/effect/receipt/Tool truth without blind redispatch |
| provider fails after committed write | revision remains current; later model operation can inspect it |
| Session is deleted | independent suggestion and minimum durable causal truth survive according to existing settlement rules |
| Repa is unused for weeks | no adherence/activity/progress inference; later Tutor may use conditionally, revise, retire, or ignore |
| referenced detail is omitted from Context | honest index/omission plus authorized lazy read; never fabricate or silently assume |
| no useful suggestion can be made | teaching and clarification continue; no placeholder plan is required |

## Reuse audit: retain, adapt, retire

The maintainer explicitly warned that earlier Gates may contain drift from a
period with less product-owner intervention. This contract therefore does not
accept or reject the 2026-08-08 Planning work as a block.

### Directly reuse

- the accepted Assignment/Planning split: Assignment remains independently
  valid and exact-revision addressable;
- exact Goal and Assignment producer references without absorbing their
  lifecycle;
- immutable revision/correction history and independent staged settlement;
- Gate 8/12 capability, permission, command, receipt, replay, recovery,
  cancellation, and durable model-operation identity;
- Gate 18 exact cuts, honest omission, capability withholding, provider-tool
  binding, and lazy exact owner reads;
- ordinary released-v1 Agent, Session/TUI carriers, tool registry, and
  provider-request compilation; and
- no background daemon and no inference of activity from clock, silence, or
  absence.

### Adapt

- the old singleton Planning aggregate becomes multiple scoped advisory
  suggestion identities;
- deterministic input/assessment/allocation stages become an open semantic
  body with exact source references and ordinary natural correction;
- old Context “working plan” visibility becomes a compact suggestion directory
  with full detail lazy-loaded only when useful;
- workload/capacity/deadline prose can survive only as explicit authored
  assumptions or exact upstream facts, not program-owned scheduling truth; and
- the arithmetic experiment becomes an optional pure authoring aid whose result
  is a cited proposal basis, never the meaning or validity of the suggestion.

### Retire or refuse

- one LearnerHome-wide current portfolio and hidden shared-capacity authority;
- program-owned remaining-work, progress, feasibility, allocation, or override
  truth;
- solver output or validation as pedagogical correctness;
- plan acceptance/adherence/activity/completion state;
- Todo/session checklist, plan-mode Markdown, Task/subagent execution, token
  capacity, provider request-plan, or FutureAttention rows relabeled as a
  learning plan;
- eager full-history injection, blind no-index search, a second memory/planner
  runtime, or a background scheduler; and
- minute-scale rescue, universal priority, or task-closure optimization.

Before implementation, the executor must inspect the current fork for reusable
Context, lazy-read, registry, semantic-command, Turn, permission, recovery, and
TUI-presentation mechanics. A new mechanism must name the missing invariant
that those mature seams cannot preserve. Reuse is rejected when identity,
authority, lifecycle, correction, or failure meaning differs; source proximity
or convenient naming is not enough.

The opening read-only reuse audit located the already sufficient transport:

- Core `learning-context/schema.ts`, `learning-context.ts`, and
  `turn/turn.ts` own versioned operation-exact cuts, bounded semantic values,
  locator-only downgrade, exact omissions, provider-capability truth, admission,
  and replay;
- OpenCode `session/llm.ts`, `session/prompt.ts`, and `session/processor.ts` own
  the frozen provider request, tool continuation, retry, and post-compaction new
  cut;
- `tool/registry.ts` and `session/tools.ts` own the actual provider-visible
  registry/permission intersection and ordinary exact tool-call dispatch; and
- existing owner reads demonstrate bounded current/exact/history/discovery but
  deliberately use different cursor, dependency, and read-time currentness
  contracts.

Gate 21 therefore needs an advisory-suggestion owner and its own query/cursor
semantics plus a versioned Context owner/entry/read capability. It does not need
a lazy transport, generic Context gateway, prompt-memory store, universal
cursor, RAG service, compaction variant, selector, or second Agent loop. Because
the current owner arrays, projection, renderer, validator, and fit tiers are
explicit Core code, direct versioned extension is the evidenced baseline; a
declarative owner-plugin framework is not pre-authorized.

## Optional arithmetic and other tools

This Gate neither prohibits nor requires a pure calculator. A model may use a
bounded arithmetic tool, code execution, or subagent to compare a proposed
study distribution when the learner's case warrants it. Such output is one
source for model-authored advice. It does not become durable feasibility truth,
does not create a global portfolio, and cannot infer learning from elapsed
allocations.

The 2026-08-08 max-flow experiment remains a useful counterexample library for
double spending, deadline bottlenecks, uncertainty, and unsupported indivisible
work. Production adoption requires a later concrete consumer and its own
contracted scope; Gate 21 does not import the experimental schema or kernel.

## Nonclaims

Gate 21 does not establish:

- objective pedagogical optimality or educational efficacy;
- a deterministic scheduler, allocator, feasibility authority, priority score,
  or global Agenda owner;
- a workload, capacity, progress, activity, adherence, or commitment ledger;
- automatic learner-state inference, mastery, retention, grade, or score;
- Goal, Assignment, FutureAttention, Course, evidence, or learner-state
  lifecycle transitions;
- a fixed pedagogy workflow, prerequisite graph, or plan taxonomy;
- background reminders, calendar/LMS synchronization, external submission, or
  minute-scale rescue;
- mandatory planning, mandatory durable writes, eager history injection, or a
  second Agent/runtime;
- general multi-pressure Tutor selection, which remains Gate 21A; or
- release readiness, deep deletion, delegated mutation, or carrier-wide
  product-loop closure.

## Strong counterexamples

1. **Task closure without learning:** a suggestion prioritizes finishing an
   implementation before understanding its invariant. All storage/replay tests
   pass, but the learner copies rather than learns. The runtime must not certify
   this plan; the learner/ordinary Tutor must be able to revise it, and teaching
   can proceed even if no plan is retained.
2. **Outside learning during silence:** a learner studies elsewhere for a week.
   Repa must not mark suggested blocks done or missed. A later correction can
   revise state/advice without daily reconstruction.
3. **Two valid alternatives:** one suggestion favors examples first, another
   theory first. Both may remain active. Stable ordering cannot turn the first
   row into product priority.
4. **Changed Assignment due date:** S1 cites Assignment N. N+1 changes the due
   boundary. S1 remains exact and fresh reads show drift; only S2 may cite N+1.
5. **Fuzzy learner state:** “I mostly understand recursion but struggle to
   derive the recurrence” cannot lawfully become 120 remaining minutes. Advice
   may use the words and uncertainty directly.
6. **Explicit teaching request:** the learner asks for an explanation. A system
   that interrupts with plan management fails even if its suggestion record is
   correct.
7. **Maximum candidate count:** more than eight active suggestions exist. The
   cut exposes exact count/omission and a bounded read path without leaking to
   unauthorized child operations or inventing a global winner.

## Contract falsifiers and reopen conditions

The contract must reopen if:

1. multiple current suggestions cannot remain useful without a new explicit
   relation or disjoint-scope authority;
2. open semantic bodies cannot be corrected or consumed reliably without a
   narrower typed plan structure earned by real cases;
3. Gate 18's bounded directory/lazy reads cannot find useful advice without an
   independently justified index or retrieval authority;
4. ordinary Agent proposals repeatedly interrupt teaching or collapse into task
   management after provider-visible semantics and causal traces are repaired;
5. a real high-value case requires program-owned arithmetic or hard constraint
   validation to prevent material harm, rather than optional authoring help;
6. natural learner correction cannot preserve clear revision identity without
   a dedicated approval/negotiation state; or
7. no later Tutor move consumes exact suggestions and changed advice does not
   alter behavior, making the owner dead storage.

A surviving falsifier should widen only the demonstrated boundary. It does not
automatically restore the old global scheduler candidate.

## Required implementation/evidence boundary after review

If and only if fresh contract/theory review accepts the exact candidate and its
Gate 20B handoff, implementation/evidence must cover:

- a normal forward migration from a frozen exact Gate 20B predecessor and fresh
  versus upgraded schema/behavior parity;
- stable multiple identities, complete immutable revisions, alternatives,
  retire/restore, current-head, exact-source, and effect/receipt/settlement
  invariants;
- responsive proposal, non-disruptive proactive proposal, learner revision,
  and Tutor revision source arms;
- exact replay, duplicate, changed conflict, stale head/source, permission
  allow/ask/deny/abort, cancellation, crash, restart, and Session deletion;
- root write, restricted/delegated default-deny mutation, authorized reads, and
  withheld-context non-disclosure;
- exact/current/history/discover reads, cursor/source drift, old-cut retry,
  omission, maximum-value fit, and more-than-eight-candidate behavior;
- exact Goal, Assignment, Course/material, evidence, and learner-state
  reference/currentness separation;
- provider-visible negative traces proving explanation, demonstration, guided
  work, and zero-write teaching are not displaced by planning;
- the responsive, fresh-Session, natural-correction, changed-learner-state, and
  non-disruptive traces above; and
- one ordinary released-v1 qualification that begins a real learning move
  rather than merely listing or administering tasks.

The exact physical schema, package/tool names, byte and row bounds, and TUI
wording are implementation choices only after they preserve this contract and
reuse the mature fork mechanisms.

## Review questions

The fresh reviewer should try to reject this candidate by asking:

1. Is the owner truly advice with independent revision meaning, or a disguised
   global scheduler, todo list, active-purpose record, or prompt memory?
2. Can multiple active suggestions coexist without hidden priority, double
   authority, or an implied learner commitment?
3. Are authorship, exact references, approximate assumptions, uncertainty, and
   currentness separable from program-certified truth?
4. Can the learner revise advice naturally while exact replay, conflict,
   permission, and recovery remain closed?
5. Does bounded Context plus lazy reads preserve old cuts, omission truth,
   authorization, and useful discovery without eager loading or blind search?
6. Can outside learning, silence, deadline drift, and stale learner state occur
   without inferred adherence, failure, or automatic plan mutation?
7. Do actual Tutor consumers use the suggestion to help learning while explicit
   teaching and zero-write paths remain first-class?
8. Has every retained mechanism from the old Gate 21 candidate or inherited
   OpenCode fork been justified by the same computational invariant, and has
   every rejected scheduler meaning actually been removed?
9. Can an all-green implementation still optimize task closure while merely
   labeling the result “learning advice”? If so, which provider-visible and
   consumer oracle exposes that failure without installing a rigid program
   pedagogy?

## Current boundary

This candidate and the reconciled owner documents complete only the local
Gate-opening derivation. After the Gate 20B contract shape is independently
accepted, Gate 21 requires its own fresh independent contract/theory review.
Implementation, migration, integration, commit, push, release,
credentialed-provider qualification, Gate 21A, and later Gates remain
separately governed.
