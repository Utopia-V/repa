# ALS-021 shared Tutor policy contrasting-traces protocol

Status: frozen v1 after two excluded diagnostic pilots; formal run not started
Date: 2026-07-12
Production policy under test: `tutor-default-v2`
Initial provider condition: `deepseek-v4-flash`, provider-default sampling,
no claimed seed

## Decision question

With the model, shared policy, tool definitions, source material, and program
boundaries held fixed, does changing the relevant learning situation lead the
Tutor to choose an appropriate different move? The production capability-
selection rule is also fixed; its active subset is allowed to change when
durable state legitimately exposes Agenda capabilities.

The concrete situations are: first explanation, independent prediction,
direct deadline help, adaptation after a failed representation, progression
after expressed understanding, purpose-sensitive cross-Session return, a
current learner request selecting the concrete form, and correct Agenda
disposition after independent versus decisively guided work.

In ordinary language: the test is whether this behaves like one Tutor that can
notice what is happening and respond differently—not a set of hard-coded modes,
and not a model that ignores the Learning System's durable context.

## Why this experiment is next

ALS-020 and the first production Agenda slice established a narrower program
boundary: future attention must preserve a bounded source-linked reason;
eligibility does not choose the teaching form; starting a revisit does not
complete it; and Agenda disposition is not learning evidence. Those results do
not show that the shared Tutor policy actually consumes the distinction.

Adding more Agenda fields now would be architectural guessing. Conversely,
trusting one attractive model transcript would confuse model fluency with a
system invariant. ALS-021 therefore uses the production loop as an instrument
and separates program guarantees from repeated model behavior.

A phase-boundary audit found one pre-existing Interaction defect before this
protocol was frozen: a new Turn could be admitted earlier than a prior
terminal event in the same Session. The fix gives Interaction one Session
event frontier and reuses it in input admission, atomic model-operation
admission, context compilation, and runtime clock flooring. Session sequence
still owns order; timestamps supply a nondecreasing causal lower bound. The
pre-fix code is not part of ALS-021.

## Evidence layers

The experiment keeps four claims separate:

1. **Program invariants.** Deterministic checks inspect source revisions,
   context cuts, tool invocations, Session/Turn state, Course route, Agenda
   status, and state revisions.
2. **Model-policy behavior.** Repeated live samples show whether the unchanged
   model/prompt/tool surface reliably selects and carries out a fitting move.
3. **Controlled learner input.** A synthetic prior transcript or current input
   creates a known pressure condition. It proves only that the input was held
   fixed.
4. **Human learning.** Not measured. No transcript establishes that a person
   learned, retained, or transferred anything.

If the model attempts an invalid write and production rejects it, the program
boundary passes while model policy fails. If production accepts an invalid
transition or stale source, the architecture fails regardless of how good the
final prose looks.

## Controlled material and state

Every condition uses the same synthetic JavaScript material and the same
single active course item. It contains factual examples for object identity,
aliasing, outer spread copies, and nested shallow-copy sharing. Keeping the
subject fixed isolates situation sensitivity; it does not support
cross-subject generalization.

Each sample gets an independent workspace and SQLite database. State is built
only through public production commands:

```text
admitted setup input
-> observed Markdown revision
-> source-grounded Course View
-> optional controlled Session transcript
-> optional source-linked Agenda concern
-> close and reopen database for Agenda-return conditions
-> real production Tutor Turn
```

The seven Agenda-backed conditions have the same material, target, source text,
source time, eligibility time, and current course position. The three primary
first-move contrasts change only the stored purpose-bearing reason. A fourth
deletes the selected purpose while the shared learner source still contains
several possible concerns. A fifth keeps the repair purpose but lets the
current learner choose a concrete form. The last pair keeps the independent-
prediction reason and contrasts a complete unaided learner occurrence with an
explicitly answer-guided repetition.

Scenario IDs, expected criteria, and block labels are lab bookkeeping. They are
never placed in the model-visible prompt.

## Condition matrix

| Family | Condition | Primary expected behavior | Durable expectation |
| --- | --- | --- | --- |
| direct | novice worked example | explain/demonstrate for a novice; no forced quiz | zero new learning-state writes |
| direct | capable independent prediction | pose a new prediction without answer leakage | zero writes |
| direct | deadline direct help | answer and explain now | zero Agenda writes |
| direct | explicit later return | teach now and preserve the requested later independent prediction | exactly one Agenda creation |
| history | failed prose | select a materially different representation after failure feedback | zero writes |
| history control | explicit visual request | demonstrate the model can obey the requested pointer/state trace | zero writes |
| history | understood prose | move to a real nested boundary without repeating basics; practice is optional | zero writes |
| Agenda | repair purpose | continue building the object-identity causal model; concrete form remains open | concern remains open after merely starting |
| Agenda | independent-prediction reason | ask before revealing | concern remains open |
| Agenda | discrimination reason | create an observable aliasing/copying distinction; concrete form remains open | concern remains open |
| Agenda control | bounded reason ablation | any current-compatible move; do not invent deleted history | concern remains open |
| Agenda control | current form selection | short code contrast; no diagram or quiz | concern remains open |
| Agenda service | complete unaided prediction | give bounded feedback and address only Agenda disposition | concern becomes addressed; no evidence claim |
| Agenda service control | answer-guided repetition | acknowledge the assistance condition without pretending independence | concern remains open |

The ablation has no hidden “correct move.” Its purpose is to show what becomes
underdetermined when the reason loses cognitive purpose. It cannot fail merely
for choosing one reasonable teaching form.

The primary learner inputs state a situation, goal, or feedback without naming
the expected teaching format. `failed_prose_explicit_visual_control`, direct
deadline help, explicit later return, and current-form selection are labeled
positive controls precisely because their current requests are explicit. A
control's success is not counted as evidence that the policy selected that form
on its own.

## Controls and attribution

- The explicit later-return case is a positive control for Agenda creation.
- Direct explanation and deadline help are negative controls for automatic
  Agenda creation.
- Failed-versus-understood history holds the prior transcript fixed.
- The explicit visual history case checks that a failed implicit-repair result
  is not merely inability to render a concrete representation.
- The three Agenda purposes hold all durable coordinates except `reason`
  fixed.
- Reason ablation tests whether the model fabricates specificity that the
  system no longer contains.
- Current-form selection tests that one durable repair purpose permits several
  later forms and that current learner constraints choose among them.
- Complete-versus-guided learner occurrences test whether the independent-work
  condition changes Agenda disposition without becoming mastery evidence.

Failure routing is predeclared:

| Observation | Attribution |
| --- | --- |
| two required actions need different information but model-visible contexts are identical | missing context/architecture fact |
| relevant difference is visible and positive controls work, but the intended contrast fails | prompt/policy/model behavior; do not add schema |
| fact exists but is buried or appears after the decision | context ordering or capability-discovery problem |
| positive control also fails | tool description, material, model, or output-channel problem |
| invalid call is rejected | model-policy failure, program-boundary pass |
| invalid call is accepted | production architecture failure |
| transport/provider failure before a valid sample | infrastructure failure, reported separately; never scored as pedagogy |

## Freeze and execution order

Each excluded diagnostic pilot ran every condition once and remains outside
all formal conclusions. Pilot-driven changes were limited to impossible
fixtures, missing observations, unsafe logging, identity/provenance repair, or
ambiguous rubric language; the shared Tutor prompt was not tuned against
outputs.

The second selected campaign has source fingerprint `5171a2474590`. A
checked-in, secret-free replay oracle feeds its selected model streams through
the current Tutor loop and compares all 29 provider-visible requests. The only
normalization is trace-wide alpha-renaming of production-generated Agenda and
Agenda-effect UUIDs; prompt text and order, tool names/descriptions/schemas and
order, learner text, durable reasons, material, timestamps, state revisions,
tool-call IDs, sampling parameters, and model output are exact. The current
code reproduces 14/14 traces and 29/29 requests. This proves input equivalence,
not repeated model output or teaching quality, and therefore supports omitting
a third paid diagnostic pilot.

The old pilot metadata called this visible policy `tutor-default-v1`. The
formal provenance name is `tutor-default-v2` because timed-steering versus
Agenda semantics and concern ID/version rendering had changed during the two
diagnostics. The replay proves that this is a corrected identity for the
second pilot's provider-visible policy, not a claim that an untested prompt was
silently substituted.

After the pilot, v1 freezes:

- this protocol and `protocol.ts`;
- exact learner inputs, controlled transcript, virtual times, and material;
- production prompt/runtime/provider/tool-binding files;
- `package.json`, `bun.lock`, model ID, thinking setting, output/step limits;
- Bun version/platform, `maxRetries: 0`, and a 90-second per-condition abort;
- eight explicit complete-block orders;
- mechanical expectations, operational qualitative definitions, blind-review
  schema/order, failure routing, and budget.
- the provider-input replay oracle and executable formal review lock,
  disagreement, adjudication, contrast, and aggregation rules.

Formal execution uses eight complete blocks. Orders were generated once before
freeze and committed; runtime never calls `Math.random()`. Every condition
appears in a different ordinal position across the eight blocks. Provider
sampling remains unseeded and is reported as such.

AI SDK's internal provider retry is disabled (`maxRetries: 0`). No policy
output is retried. A transport failure or timeout may be rerun once only with
the explicit `--retry-infrastructure` flag; append-only attempt phases and both
result records remain. A valid unfavorable output, a schema/tool policy
failure, or a program invariant failure is never replaced. Two infrastructure
failures leave that block incomplete.

Campaign directories are keyed by the draft/frozen source hash and guarded by
an exclusive lock. Before provider dispatch, the harness writes an attempt
journal. After provider completion it persists sanitized calls, outcome,
durable state, observed cost, and a separate budget charge before qualitative
assessment. A crash after a valid result can only finalize that result; it
cannot silently dispatch another call. A program or harness-integrity failure
halts before the next condition.

Before a completed case is skipped, or a result persisted just before a crash
is finalized on resume, the selected result must be revalidated against the
exact case directory, campaign coordinates, scenario, requested model,
frozen-source fingerprint, program/alias gates, and cost. A foreign, stale, or
internally inconsistent result or `complete.json` fails closed.

## Recording and budget

The lab-only AI SDK middleware observes without changing the provider stream.
It drops header/cookie containers and abort signals, removes secret-like
fields, and scrubs explicit credentials without treating ordinary header
counters as global secrets. Each ignored raw bundle records:

- protocol and source hashes, Git HEAD and dirty summary;
- requested model/provider/thinking configuration and actual response model
  metadata when supplied;
- planned and actual order, condition identity outside the provider prompt,
  deterministic Turn identities and virtual time;
- sanitized provider prompts, tools, parameters, stream parts, final response,
  token usage, and conservative production cost estimate;
- model context cuts, Session items, tool invocations, final Course/Agenda
  projections, state revision, and Turn outcome;
- transport, schema/tool, program-invariant, and qualitative failures as
  separate fields.

If response metadata reports more than one actual provider model ID within a
campaign, execution halts and the blocks are not pooled. Missing provider model
metadata is reported rather than guessed.

Live commands require `REPA_LAB_MAX_USD`. Before starting another condition,
the harness reserves a conservative per-condition allowance and refuses to
cross the configured campaign cap. For an infrastructure attempt without
complete usage, the budget charge is the larger of observed estimated cost and
the frozen reserve; observed estimate and budget charge are recorded
separately. Neither is a provider invoice.

## Scoring

Mechanical checks are exact. Any attempted mutation—including a rejected or
schema-invalid model call—is compared with the predeclared condition. A
rejected call is a program-boundary pass and a model-policy failure. Successful
material read is required when the Tutor must recover course content. Reason
ablation permits a current-compatible move without a read, and both Agenda
service controls carry the same complete program and answer in the current
learner occurrence, so bounded feedback/disposition does not require a
redundant course read.

Mechanical checks do not decide whether prose is a good explanation. Formal
review uses `review.ts` to select only each case's `complete.json` result and to
export 112 opaque packets in a frozen affine order. Packets contain the actual
model boundary and response but no scenario ID, family, expected criterion, or
mapping. Two independent reviewers each score every packet using only the
generic schema:

- situation-appropriate move and requested direct help;
- representation actually changed when required;
- learner's cognitive role, current steering, boundary progress, and
  discrimination opportunity;
- answer leakage, source-factual severity, and unsupported learning-state
  claims;
- when a durable learner-requested Agenda write is visible, preservation of
  its substantive purpose and grounding in the visible learner source;
- concise rationale and excerpt for any failure.

Reviewer A and Reviewer B must run in separate agent contexts, using distinct
recorded model and provider conditions, that have not received
`review-map.json` or scenario-specific `reviewRules`. Their canonical task IDs,
model/provider labels, sealed-input hash, result paths, and file hashes are
recorded in the final research report. The primary architect does not
substitute its own ratings for either blind pass; it adjudicates only locked
disagreements after both files validate.

The reviewer must judge behavior, not keywords. A response containing the word
“diagram” can still repeat the same explanation; a question mark can still
leak the answer.

Operational definitions are frozen in `protocol.ts`: a representation change
must externalize a causal relation or execution sequence absent from the prior
prose; answer leakage includes final output or a decisive hint before learner
commitment; a severe factual error reverses the object-identity/shallow-copy
oracle; and Agenda disposition or a self-report cannot be inflated into
mastery, retention, or forgetting. Before packet distribution, a review-input
seal hashes packet/instruction/map artifacts, all 112 completion markers and
result bundles, the frozen manifest, and executable review-rule sources. Both
reviewer submissions must return that exact seal hash. The two individual and
two contrast JSONL files are then validated and locked before
`review-map.json` is revealed. Every later diff or aggregation rechecks both
seals and all underlying hashes. Field disagreements and any
`unclear`—including two reviewers who both say `unclear`—enter an exact
adjudication queue. Adjudication may resolve only that queue, may not return
`unclear`, and must retain a short evidence citation and both original ratings.

`complete.json` is also the denominator authority. Every completed
non-infrastructure condition occupies its predeclared block slot, including a
normal provider completion that produced no usable assistant text or made an
invalid/schema-rejected tool attempt. Such a packet remains visible to review,
and `review-map.json` marks its primary qualitative criterion as an automatic
failure when `reviewablePolicySample=false`. It is never dropped from the
eight-block denominator.

In addition to 112 isolated packets, reviewers receive eight anonymous
failed-versus-understood pairs and eight anonymous Agenda-purpose triads in a
frozen order. Per block, the first contrast passes only when the failed sample
has a real representation change and situation fit, the understood sample has
real boundary progress and situation fit, neither is an automatic failure,
and the blind contrast rating says the moves are materially distinct. The
Agenda triad similarly requires repair situation fit, independent cognitive
role without answer leakage, observable discrimination with situation fit,
no automatic failure, and a passing blind contrast rating. These are typed
predicates applied after ratings are locked; free-text `observedMove` and
scenario counterexamples are maintenance aids, not keyword-scored gates.

Predeclared engineering gates for the eight formal blocks are:

- every completed formal result satisfies the deterministic program and
  observer-integrity preconditions; a failure is campaign corruption, not a
  scoreable sample;
- severe source-factual errors or fabricated mastery claims: 0;
- each non-ablation condition's primary qualitative criterion: at least 7/8;
- failed-versus-understood paired sensitivity: at least 7/8 blocks;
- explicit visual representation positive control: at least 7/8;
- the three reason-specific Agenda moves all preserve their distinct cognitive
  roles: at least 7/8 blocks;
- current-form selection: at least 7/8;
- unaided-complete Agenda address recall: at least 7/8, with zero false address
  in the answer-guided control;
- Agenda precision in zero-write cases: 100%; explicit-request Agenda recall:
  at least 7/8.

The production suite, rather than this behavior matrix, remains responsible
for proving that illegal state transitions are rejected. ALS-021 contains no
adversarial illegal-transition condition and therefore does not invent a
numerical “accepted illegal transitions” observation it cannot measure.

Only a transport/timeout infrastructure attempt can be excluded, in which case
the block remains incomplete until the single allowed infrastructure retry
either completes or also fails. All completed non-infrastructure results enter
the qualitative denominator. These thresholds are a predeclared engineering
acceptance screen, not a reliability estimate or statistical proof about a
population of learners or models.

## Promotion rule

The experiment may promote only demonstrated program invariants or a narrow
change to shared context/policy/capability semantics. It must not promote:

- scenario IDs or expected-action tables;
- a Tutor move enum inferred from this matrix;
- a production enum made from the three Agenda purposes;
- topic-specific routing for JavaScript objects;
- hidden learner profiles, simulated-student machinery, reviewer labels, block
  orders, thresholds, or fixture vocabulary;
- a claim that explanation, review, planning, or practice is universally
  central.

If the model behaves differently as intended, the conclusion is only that the
current shared policy and bounded context can express these contrasts under the
tested configuration. If it does not, the attribution table decides whether
to revise context, shared policy, tool ergonomics, or nothing at all.
