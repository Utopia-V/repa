# Selected current learning purpose: the missing control seam

Date: 2026-07-13

Status: Architecture synthesis and experiment admission record. Its pre-run
model-assisted-selector recommendation is superseded by the ALS-022B-E
post-run synthesis at the end. This document does not accept a database table,
pedagogy enum, second runtime, or universal selection policy.

## In plain language

Repa already remembers *things that may deserve attention later*. ALS-021
showed that remembering one of them and showing it to the model does not make
it govern what the Tutor does now.

The missing step is adoption:

```text
current learner request + retained constraints + durable candidates
                            |
                            v
              choose what governs this move
                            |
                            v
          bind that purpose into one model context cut
                            |
                            v
        let the model choose the concrete teaching action
                            |
                            v
              observe the learner and reconsider
```

For example, an Agenda concern may say that the learner should make an
unaided prediction before seeing the answer. It is not enough for that sentence
to appear among several background facts. If the Learning System adopts it for
the current move, the next model sample must see an explicit current purpose:
obtain the prediction first; revealing the answer or a decisive hint is
incompatible with that purpose. The model remains free to choose the example,
wording, representation, and exact question.

This is neither a deterministic lesson script nor “let the prompt handle it.”
The program owns whether a purpose is active and which durable fact it came
from. The model may participate in the semantic choice and owns flexible
realization inside the selected constraints.

## Question and decision consequence

The architecture question is:

> How can program/model cooperation turn durable candidate state into a
> selected current learning purpose that constrains the realizing sample,
> without scripting pedagogy or inventing a universal activity state?

Different evidence changes the next decision:

- If an oracle-selected purpose changes the failed ALS-021 behavior, the
  missing boundary is selection and binding. The next proof should pressure
  how the model and program select among real alternatives.
- If the model still leaks the answer after an explicit selected purpose, a
  selection receipt is insufficient. Stronger staging, output admission, or a
  different model may be necessary before production implementation.
- If model-assisted selection cannot respect direct help, redirection, no-op,
  and multiple-candidate cases, do not promote a general selector. Admit only
  deterministic subcases that have evidence, or revisit the composition
  strategy.

This is a smaller and more diagnostic experiment than rerunning ALS-021. It
changes one causal variable instead of rescuing its broad rubric.

## Evidence that locates the break

### What ALS-021 established

ALS-021 completed all 112 planned production-policy samples. In every one of
the eight `return_independent_prediction` trials:

- the source-linked Agenda reason was present in the fresh-Session context;
- the concern remained open, so persistence and visibility were truthful; and
- the Tutor nevertheless supplied the answer or decisive reasoning before the
  learner's unaided prediction.

The reliable conclusion is not that the Tutor needs more memory. Candidate
state survived. The candidate did not become control. See
[`shared-tutor-policy-formal-result-2026-07-13.md`](shared-tutor-policy-formal-result-2026-07-13.md).

### Current production trace

The current trace has one precise empty space:

1. `runTutorTurn` admits the learner input and builds model-visible Session
   messages.
2. Before every sample, AI SDK `prepareStep` calls
   `beginTutorModelOperation`.
3. `compileTutorContext` loads active steering, the active Course View, and up
   to eight open Agenda concerns.
4. `beginModelOperation` revision-checks and persists the exact immutable
   context cut in `model_operation.context_json`.
5. Prompt rendering calls Agenda entries candidates and explicitly says their
   reasons are descriptive data, not executable instructions.
6. A tool result can continue the same Turn; the next `prepareStep` recompiles
   state.
7. Recovery fails ambiguous running model/tool work and interrupts the Turn;
   it does not blindly replay it.

There is no `selectedCurrentPurpose` contribution between steps 3 and 4. The
existing per-sample recompile and immutable context cut are already the right
transport seam. A second Agent runtime is not missing.

Relevant implementation points:

- `src/runtime/run-tutor-turn.ts`
- `src/tutor/compile-context.ts`
- `src/tutor/render-system-prompt.ts`
- `src/runtime/tutor-tool-binding.ts`
- `src/interaction/records.ts`
- `src/learning/agenda/future-attention-tool-execution.ts`

## Meanings that must remain separate

| Meaning | Owner | What it is not |
| --- | --- | --- |
| current learner request | admitted Turn / learner | a low-priority candidate |
| retained steering | Tutor policy state | a learning goal, preference, or task |
| Agenda concern | Agenda | an executing activity or proof it was served |
| eligible candidate | context composition | permission to override the learner |
| selected current purpose | Tutor composition for a bounded control interval | mastery, evidence, or Agenda disposition |
| concrete explanation/question/example/tool use | model-led Tutor realization | durable authority merely because it appears in prose |
| completed service occurrence | interaction plus owning domain command | automatically implied by selection or topic mention |
| learning evidence/inference | future learner authority, when earned | an Agenda or model assertion |

In particular, selecting a concern never addresses it. An interrupted Turn
after selection has produced no service occurrence. A question asked now may
be answered by the learner in a later Turn; only the later complete,
source-aligned occurrence can settle the Agenda disposition.

## The smallest control invariant

The smallest invariant supported by ALS-021 and classical control work is:

> A candidate is not control. When a candidate is adopted, the context cut
> must identify the selected purpose, its trusted provenance, and any
> constraint that rules out otherwise-plausible but purpose-defeating actions.
> Concrete realization remains open, and the selection is reconsidered after
> relevant feedback.

For the demonstrated independent-prediction case, revealing the answer or a
decisive hint before the learner commits is inadmissible. Many questions,
examples, and representations remain admissible. This is why the boundary is
not a lesson plan or pedagogy enum.

The selected purpose is analogous to a short-lived intention or control
reference, not a new durable learner fact:

- BDI work distinguishes options/desires from an intention that constrains
  incompatible action while leaving the exact means open.
- Receding-horizon control distinguishes observed state, selected reference,
  constraints, and the concrete control move, then chooses again after
  feedback.
- Classical control arbitration distinguishes possible activations from the
  decision about which one governs now.

Only those separation and feedback-timing ideas transfer. The learner is not a
plant; Repa controls its own Tutor behavior, not the learner. There is no
justified scalar objective, known transition model, BDI mental ontology,
universal blackboard, or optimal course trajectory.

Primary sources:

- Rao and Georgeff, *BDI Agents: From Theory to Practice* (1995),
  [AAAI PDF](https://cdn.aaai.org/ICMAS/1995/ICMAS95-042.pdf).
- Cohen and Levesque, *Intention Is Choice with Commitment* (1990),
  [paper PDF](https://ai.stanford.edu/~epacuit/classes/lori-spr09/cohenlevesque-intention-aij90.pdf).
- García, Prett, and Morari, *Model Predictive Control: Theory and
  Practice—A Survey* (1989),
  [DOI record](https://www.sciencedirect.com/science/article/pii/0005109889900022).
- Hayes-Roth, *A Blackboard Architecture for Control* (1985),
  [DOI record](https://www.sciencedirect.com/science/article/pii/0004370285900633).

## Reference implementation findings

The pinned references provide generic mechanics, not the learning decision.

### OpenCode v1.17.18

OpenCode can bind an already-selected current-turn system overlay into the
latest user message, reload it on each loop iteration, and carry it through
tool continuation:

- `.reference/opencode/packages/opencode/src/session/prompt.ts:635-670`
- `.reference/opencode/packages/opencode/src/session/prompt.ts:1088-1098`
- `.reference/opencode/packages/opencode/src/session/prompt.ts:1257-1286`
- `.reference/opencode/packages/opencode/src/session/llm/request.ts:56-112`

Its todo list does not select the current action. It is session/UI state; the
model sees it again through tool-result history. Plan-exit and question tools
do demonstrate the reusable mechanic: a correlated selection/result becomes
model-visible input and the same loop continues.

Preserve replacement-style current-turn overlay and same-loop continuation.
Do not import session todos, plan files, build agents, or opaque prompt text as
the complete learning contract.

### Codex rust-v0.144.1

Codex has strong per-step snapshot and application-context mechanics:

- `.reference/codex/codex-rs/core/src/session/turn.rs:142-277`
- `.reference/codex/codex-rs/core/src/session/turn.rs:1083-1156`
- `.reference/codex/codex-rs/core/src/session/mod.rs:3576-3673`
- `.reference/codex/codex-rs/core/src/state/additional_context.rs:15-35`

Its `update_plan` is a checklist notification, not program-owned current
intent. Additional-context entries are additive: removed or unchanged values
can remain visible through history. That is useful context transport but unsafe
as mutable selected-purpose state.

Preserve immutable step views and correlated tool/user selection results. Do
not append changing selections as historical prompt fragments; the current
context cut must replace or explicitly supersede them.

The pinned identities are recorded in `references.lock.json`. Neither
reference selects a source-bound learning purpose, preserves a learner-role
constraint, or defines what later occurrence serves it. Those remain Repa
semantics.

## Current first-party Agent guidance

Current OpenAI and Anthropic guidance reinforces the same altitude:

- orchestration may keep application state, select context, switch
  instructions per step, and continue tool use without defaulting to multiple
  agents;
- context should contain the smallest high-signal set needed for the current
  decision, often with just-in-time retrieval;
- agentic flexibility is useful where semantic judgment is open, while hard
  rules and known workflow structure stay in code; and
- extra complexity should be admitted only when a simpler path demonstrably
  fails.

Sources:

- OpenAI, [Building agents: orchestration](https://developers.openai.com/tracks/building-agents#orchestration).
- Anthropic, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).
- Anthropic, [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents).

The older Anthropic “think tool” pattern is not a reason to add a no-op
reasoning tool. Its page now recommends extended thinking in most cases. Repa
needs an effectful selection receipt only if selection is a real control
decision, not a ritual call.

## Candidate architecture comparison

### 1. Keep exposing candidates and improve prose

Rejected as the control seam. ALS-021 is a direct counterexample. Better prose
may improve average behavior, but no inspectable choice binds one candidate to
the realizing sample.

### 2. Host selects a candidate synchronously

Composition can deterministically project a selected purpose with no extra
model call. This is correct for facts and priorities whose meaning is already
computable, such as a current explicit learner request or a hard prohibition.

It is not yet a general Agenda selector. “Only one eligible concern exists”
does not mean “override a deadline or redirection,” and converting a free-text
reason into an exact cognitive constraint requires semantic judgment. A
universal score or rule tree would be invented architecture.

Use this shape only for narrow deterministic cases that later evidence earns.

### 3. Same-loop model-assisted selection, then realization (pre-run candidate)

This was the recommended prototype boundary before ALS-022B/C. Both subsequent
selector shapes failed; the historical reasoning is retained below rather
than rewritten as if the result were known in advance.

When one or more durable candidates could materially change the response, a
bounded control step lets the model propose one visible candidate or no
adoption. The Learning System then:

1. validates the candidate identity, version, target state, eligibility, and
   current context cut;
2. binds exact source provenance and the model's scoped operative
   interpretation into a selection receipt;
3. exposes no learning-state mutation as a consequence of selection;
4. recompiles the next immutable context cut with the selected purpose; and
5. lets the normal model/tool loop realize it.

The selection step must not leak learner-visible teaching before binding.
During that step, only the control capability is available and the call is
required. Any incidental prose is control trace, not Session dialogue. This is
a policy phase inside the same finite Tutor loop, not a second runtime or a
user-visible mode.

A prototype receipt needs only enough to make the next sample and later audit
truthful:

```text
scope: current Turn / control interval
source: Agenda concern ID + entity version + target/source references
decision: adopt this concern | adopt none
operative purpose: short model-assisted interpretation, visibly derived
material learner-role constraint: only when it changes admissible action
service boundary: what this move seeks, without claiming it has happened
reconsideration causes: learner override, stale source, failure, or next Turn
```

The exact stored reason remains visible beside the interpretation. Model text
does not become a durable learner fact. If a constraint kind later has two real
consumers and deterministic validation becomes valuable, it may earn a typed
form; the first prototype must not invent a complete pedagogy vocabulary.

The existing `prepareStep` recompile, model-operation context cut, tool
settlement, and recovery behavior are the likely integration seam. A
process-local active selection is sufficient because an interrupted running
Turn is not resumed. The selection tool receipt and immutable realization cut
remain durable audit evidence; Agenda remains unchanged.

### 4. Separate selector model or pipeline

Not the baseline. It duplicates context, adds latency/cost, and risks making a
hidden classifier the real Tutor controller. Reconsider only if the same-loop
control phase cannot be made truthful or if a demonstrably cheaper selector
preserves the same semantics.

### 5. Durable Agenda engagement/activity

Not earned. A durable `inactive -> engaged -> served` lifecycle would require
cross-Turn commitment, correction, stale-target reconciliation, crash
recovery, and UI inspection. Current evidence needs only a bounded current
control decision. A provider crash must not leave a phantom activity the
learner never experienced.

Cross-Session learning *state* already persists in Agenda. A one-Turn
selection does not need to persist as an active fact across Sessions merely
because the candidate does.

## Recommended lifecycle and failure behavior

### Scope

- The selected purpose governs realization samples in the current Turn after
  its receipt.
- It may survive material-read or other non-mutating tool continuation inside
  that Turn.
- It ends on completed learner-visible response, Turn failure/interruption, a
  validated conflicting state change, or explicit reselection.
- It is not automatically active in a new Turn or Session. Durable candidates
  are re-observed and selected again against the new request.

### Ownership

- Agenda owns the candidate and its disposition.
- Tutor composition owns the active selection and context projection.
- The model proposes open semantic interpretation and concrete realization.
- Runtime validates identity/version/scope and records the receipt.
- Interaction owns the completed learner/assistant occurrences.

### Recovery and replay

- Exact replay of an already-settled selection call may return the same
  receipt.
- A conflicting second selection from the same selection cut fails.
- Crash after selection interrupts the Turn; the concern remains open and no
  service is invented.
- A new Turn reselects from current durable state.
- The old model-operation cut and tool receipt remain inspectable, but are not
  appended as a still-active prompt instruction.

### Capability exposure

- Ordinary direct questions with no relevant durable candidates do not pay a
  selection ceremony.
- When a control step is required, mutation and learner-facing realization
  capabilities are withheld until its receipt.
- Selection is not Agenda addressing, evidence creation, route advancement,
  or learner steering.

## Counterexample matrix

| Situation | Required result | Failure exposed |
| --- | --- | --- |
| generic “continue” plus one eligible unaided-prediction concern | adopt it; ask before disclosing | candidate visibility without control |
| same concern plus “tell me directly; deadline now” | current request wins; concern stays open | sticky Agenda override |
| learner reports seeing the answer first | do not close independent concern; a new opportunity is optional | selection/service/evidence collapse |
| repair, discrimination, and prediction concerns share a target | select one explicitly, combine only with stated compatibility, or ask | target-based merging |
| upcoming concern with no early request | do not proactively select | eligibility/timing collapse |
| stale or superseded target | reject selection and recompose | stale provenance |
| ordinary conceptual question with no relevant concern | answer normally without control ceremony | universal workflow pollution |
| selected purpose followed by material read | preserve selection in the next cut | tool continuation loses control |
| provider failure after selection | interrupt; no service, address, or mastery | phantom completion |
| new Turn redirects the Tutor | old selection is inactive; reselect | accidental cross-Turn stickiness |
| current learner input already completes the concern | address from the completed occurrence; no forward selection required | mandatory preselection ritual |

## Explicitly rejected imports

- a universal `FutureAction`, `Activity`, or `Intervention` aggregate;
- a stored teaching-stage state machine;
- a mode or pedagogy enum for every explanation;
- a scalar scheduler score or one-winner queue;
- BDI belief/desire/intention stores or plan libraries;
- numeric MPC plant/reward/optimality claims;
- a universal blackboard;
- OpenCode todos, plan/build-agent switching, or Codex `update_plan` as
  learning authority;
- additive historical prompt fragments as mutable current intent;
- treating selection as service, evidence, mastery, or Agenda disposition;
- requiring every Turn to make a control tool call; and
- a second Agent runtime.

## Admitted focused proof: ALS-022A

Before production implementation, isolate realization from selection.

Use the exact `return_independent_prediction` setup and production Tutor loop.
Leave the learner input, course, Agenda candidate, policy profile, provider,
tools, and continuation behavior unchanged. Add one oracle-selected,
high-signal current-purpose contribution to every model sample in the Turn:

- purpose: obtain an unaided prediction before explanation;
- incompatible action: no final output, decisive step, or hint that removes
  the central decision before the learner answers;
- service boundary: present one clear answerable prediction and wait;
- non-effect: selection does not address the concern or prove learning; and
- flexibility: example, wording, representation, and material read remain
  model choices.

Run eight independent DeepSeek-V4-Flash, non-thinking samples, matching the
eight ALS-021 failures. This is an oracle ablation, not a benchmark campaign.
There is no blind review or qualitative aggregate. Inspect the eight complete
responses against one operational question: did the response leave a clear
prediction for the learner without first supplying the answer or a decisive
hint?

Interpretation:

- 7/8 or 8/8 supports the selected-purpose projection as sufficient for this
  behavior and admits the next selector/arbitration proof.
- 0-5/8 rejects prompt-level binding as sufficient and directs work toward
  stronger realization staging/admission or provider comparison.
- 6/8 is inconclusive; inspect failure mode before any rerun. No automatic
  rescue is authorized.

The live budget is capped at USD 0.02, with zero provider retries. Raw traces
remain under the lab's ignored `.runs/`; the stable result, exact intervention,
outputs relevant to the criterion, confounds, and cost belong in a research
result document.

## What ALS-022A cannot prove

Even a pass does not prove:

- that a model will select the right purpose among conflicts;
- that the projection generalizes to repair, discrimination, planning, or
  review;
- that a human learner learns more;
- that the exact fields deserve production persistence;
- that every purpose can be enforced through model context alone; or
- that DeepSeek-V4-Flash is the permanent provider.

It proves only whether explicit adoption and binding can repair the one
well-located realization failure that ALS-021 exposed.

## Post-run synthesis

Four focused results now replace the pre-run recommendation:

1. **ALS-022A — realization succeeds after explicit binding.** It produced
   7/8 purpose-valid predictions and withheld the answer in 8/8, compared with
   0/8 under candidate exposure alone.
2. **ALS-022B — `Agenda candidate | none` selector fails.** It passed 12/22
   strictly and sometimes selected a concern ID while rewriting its meaning to
   the incompatible current request.
3. **ALS-022C — exact-source selector still fails.** After deterministic
   filtering and immutable source binding, it passed 10/18 and ignored Agenda
   in every generic-continuation sample.
4. **ALS-022D — conditional default succeeds for the demonstrated sole
   candidate.** Without an extra selector sample, it passed all 10 generic,
   direct-help, requested-form, completed-occurrence, and redirection cases.
5. **ALS-022E — exact reason plus selected status is insufficient.** Removing
   the explicit learner-role restatement yielded only 3/8 strict valid
   independent predictions, earning one narrow operative constraint.

The recommended topology is therefore no longer “always run a selector.” It is:

```text
program filters legality and preserves exact source meaning
        |
        +-- one demonstrated legal candidate -> conditional default
        |                                      inside normal realization
        |
        +-- explicit current request ---------- higher-priority exact input
        |
        +-- several material candidates ------- unresolved/reversible choice;
                                                 no universal selector score
```

Selection remains a real composition meaning, but it is a priority-bearing
conditional default rather than an unconditional winner or a separate model
stage. The model owns flexible realization and semantic override by the exact
current request; the program owns legality, candidate count, identity, version,
source meaning, scope, and durable effects.

ALS-022E establishes that the demonstrated conditional contribution needs both
exact source reason and an explicit `learner response before Tutor disclosure`
constraint. It does not prove a general compiler or vocabulary for arbitrary
Agenda reasons. Multiple-candidate policy and clean suppression of internal
control prose remain open. These limits block a speculative general production
implementation, not the architecture conclusion above.

Stable results:

- [`selected-current-purpose-oracle-result-2026-07-13.md`](selected-current-purpose-oracle-result-2026-07-13.md)
- [`selected-current-purpose-selector-result-2026-07-13.md`](selected-current-purpose-selector-result-2026-07-13.md)
- [`governing-source-selector-result-2026-07-13.md`](governing-source-selector-result-2026-07-13.md)
- [`conditional-current-purpose-result-2026-07-13.md`](conditional-current-purpose-result-2026-07-13.md)
- [`exact-reason-conditional-default-result-2026-07-13.md`](exact-reason-conditional-default-result-2026-07-13.md)
