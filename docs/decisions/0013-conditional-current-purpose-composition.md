# ADR-0013: Bind current learning purpose as a conditional composition default

Status: Accepted

Date: 2026-07-13

## Plain-language decision

Repa will not ask a separate classifier model to decide what the Tutor should
do before every relevant response.

When the program can establish one legal learning concern that should be the
default for a Turn, it places that concern—unchanged and source-bound—beside
the learner's exact current request in the model context. The learner's
explicit current request has higher priority. A generic “continue” lets the
default guide the Tutor; a direct request, different requested form, completed
occurrence, cancellation, or redirection can override it without deleting or
rewriting the concern.

The LLM still decides how to explain, question, demonstrate, research, or use
tools. The program decides what candidates are legal, what exact state they
came from, how long the default lasts, and what durable effects are allowed.

## Context

Roadmap 07 established an Agenda-owned, source-linked future-attention concern.
ALS-021 then showed that durable visibility is not control: the exact reason
survived a fresh Session, but all eight independent-prediction returns revealed
the answer before the learner predicted.

Four focused experiments separated the boundary:

- ALS-022A explicitly bound the purpose and changed the behavior from 0/8 to
  7/8 purpose-valid predictions, with no answer leakage in 8/8.
- ALS-022B asked DeepSeek-V4-Flash to choose `Agenda candidate | none` and
  author an operative meaning. It passed 12/22 and sometimes attached an
  incompatible current-request meaning to a valid concern ID.
- ALS-022C filtered illegal choices and bound exact sources, then asked the
  model to choose `current_request | agenda_candidate | unresolved`. It passed
  10/18, ignored Agenda in every generic continuation, and did not recognize
  multiple-candidate ambiguity.
- ALS-022D removed the selector sample. A sole legal concern became a
  conditional default inside the ordinary realizing sample. Generic
  continuation, direct help, requested comparison form, completed occurrence,
  and learner redirection passed 10/10 with truthful Agenda state.
- ALS-022E removed ALS-022D's explicit learner-role restatement and retained
  only exact Agenda reason plus conditional-default status. Strict inspection
  fell to 3/8: historical reason alone did not reliably prevent answer or
  decisive-rule disclosure before the learner response.

The evidence rejects both candidate-only background prose and a mandatory
universal selector. It supports a priority-bearing composition contribution
for the demonstrated one-candidate control relationship.

## Decision

### 1. No universal preliminary selector

Tutor composition does not add a mandatory LLM classifier before ordinary
teaching. Plan, study, review, and similar policies continue to share one
finite Tutor loop. There is no selector agent, controller service, or second
runtime.

A future bounded model-assisted arbitration may be admitted for a different
demonstrated conflict, but it is not the baseline and cannot be the authority
for program-known legality or source meaning.

### 2. Program-owned legal option construction

Before a purpose contribution can be formed, code owns and checks:

- eligibility and timing;
- target/view freshness;
- source, entity, and policy revisions;
- current course/target visibility;
- the exact candidate count and truncation state; and
- whether an accepted policy exists for promoting this candidate shape.

Upcoming or superseded concerns may remain visible for awareness, correction,
or dismissal. They are not legal current defaults. Prompt prose never turns an
illegal candidate into a legal one.

### 3. Conditional default, not unconditional winner

For a demonstrated policy with one legal candidate, Tutor composition may add
one conditional current-purpose contribution to the immutable context cut.
The contribution preserves:

- owning authority and candidate identity;
- entity/source/target revisions;
- exact source reason;
- conditional priority relative to the exact admitted learner request;
- Turn/control-interval scope;
- any separately justified operative learner-role constraint; and
- explicit non-effects: selection/default is not service, evidence, mastery,
  or Agenda disposition.

The exact current learner request remains higher priority. An incompatible
explicit request can override the default in the ordinary realizing sample.
Override does not rewrite the source reason, close the concern, or create a
durable learner inference. Generic continuation may let the default govern.

“Conditional default” is a composition meaning, not a durable domain status.
The context cut records what the model was given and its priority relation; it
does not falsely claim that a separate selector made an unconditional choice.

### 4. Exact source meaning cannot be model-rewritten

A model may interpret a selected source for the current Turn, but its prose
cannot replace the authoritative source reason or borrow the source's
provenance for an incompatible current request. Any model-authored operative
interpretation is untrusted, scoped, and shown beside the exact source.

ALS-022E shows that exact reason plus selected status is insufficient for the
demonstrated independent-prediction concern. That concern therefore requires a
separate operative learner-role constraint equivalent to:

```text
learner response before Tutor disclosure of answer or decisive hint
```

Agenda is the likely durable owner because the boundary affects both later
realization and whether a guided occurrence can truthfully serve the concern;
Tutor composition projects it as operative. This ADR does not define a general
compiler from arbitrary Agenda `reason` text or authorize a universal pedagogy
enum. The first production contract remains narrow to the demonstrated
constraint, source-bound and correctable.

### 5. Multiple material candidates remain unresolved

This ADR does not rank several materially different eligible purposes. If no
accepted deterministic rule selects among them, the Tutor may:

- ask the learner;
- make a clearly reversible ordinary choice without false source claims; or
- retain the bounded candidate list until later context resolves it.

It may not silently turn one LLM classifier score into durable priority or a
universal scheduler.

### 6. Scope, persistence, and recovery

The conditional default is scoped to the current Turn or shorter control
interval. It may survive a non-mutating material read into the next newly
compiled sample of that Turn. It ends on:

- completed learner-visible response;
- Turn failure or interruption;
- a validated state change that removes or supersedes its source; or
- a new Turn with a new exact learner request.

The active default may remain process-local because running Turns are not
resumed after crash. The exact immutable model-operation context cut is the
durable audit record. Agenda remains the durable cross-Session authority. A
crash after composition invents no service, address, activity, evidence, or
mastery; a later Turn recompiles from current state.

### 7. Realization and durable effects stay separate

The model owns compatible realization: explanation, example, question,
representation, research, and tool use. Asking a question or beginning an
explanation does not address the concern. Only a complete, source-aligned
occurrence and the existing domain command may change Agenda disposition.

Internal control terms, concern IDs, precedence reasoning, and pre-tool
preambles are not Tutor prose merely because a model emitted them. The current
runner/prompt has demonstrated leakage of that narration. Presentation work
must preserve natural reminders while keeping architecture/control traces out
of the persisted learner-visible answer.

## Ownership and dependency consequences

- Agenda owns the durable candidate and its lifecycle.
- Tutor composition owns conditional purpose contributions and priority.
- Interaction owns admitted requests, model-operation context cuts, and
  completed occurrences.
- Runtime owns finite sampling, continuation, failure, and process-local active
  coordination.
- Models own open semantic realization and may propose interpretations, never
  source legality or provenance.

No learning-domain module imports AI SDK or provider types. No production
`Activity`, `Intervention`, `Intention`, or selector service follows from this
decision.

## Consequences

- The next production contract, if admitted, extends structured Tutor context
  rather than Agenda lifecycle or the Agent runtime.
- A one-candidate default adds no extra provider round trip.
- Exact current-request override remains available without cancelling future
  attention.
- Context cuts can explain which source/default and priority the realizing
  sample saw.
- Multiple candidates and generic reason compilation stay explicit open
  boundaries rather than hidden heuristics.
- The first implementation must remain Agenda-specific until another real
  authority consumes the same contribution invariant; no generic manager or
  framework is introduced in advance.

## Alternatives rejected

### Candidate-only prompt background

Rejected by ALS-021. Visibility preserved memory but not the learner-role
constraint.

### Mandatory model-assisted selector

Rejected as the baseline by ALS-022B/C. Improving transport and option labels
did not make the production-default model a reliable arbiter, and one shape
allowed false provenance.

### Separate stronger selector model

Not selected. It adds context duplication, latency, cost, and a hidden second
controller before simpler same-sample composition has failed. It may be
reconsidered only for a concrete unresolved conflict with provider-qualified
evidence and a truthful fallback.

### Deterministic semantic rule tree or scalar scheduler

Rejected without evidence. Code owns legality and accepted structural policy,
not an invented taxonomy of every learner request and teaching purpose.

### Durable Agenda engagement/activity

Rejected because current evidence needs no cross-Turn active-selection state.
It would create correction, stale-target, crash, and phantom-completion
lifecycles without a restart consumer.

### Model-authored replacement purpose

Rejected by ALS-022B's false-provenance counterexamples. Interpretation may be
scoped; authoritative source meaning remains exact.

## Deferred contract details

This ADR accepts the ownership and priority topology, not a complete production
field list. ALS-022E has decided that one explicit operative constraint is
required for the demonstrated consumer. Before implementation, a focused
contract must decide:

- the narrow stored and projected form of
  `learner response before Tutor disclosure`;
- how the contribution appears in the structured context cut;
- how it is rendered without internal control narration;
- how a non-mutating continuation retains it; and
- how tests observe current-request override without inferring learning from
  prose.

These details do not reopen the rejected universal selector or authorize a
general pedagogy schema.

## Evidence

- [`../research/shared-tutor-policy-formal-result-2026-07-13.md`](../research/shared-tutor-policy-formal-result-2026-07-13.md)
- [`../research/selected-current-learning-purpose-control-seam-2026-07-13.md`](../research/selected-current-learning-purpose-control-seam-2026-07-13.md)
- [`../research/selected-current-purpose-oracle-result-2026-07-13.md`](../research/selected-current-purpose-oracle-result-2026-07-13.md)
- [`../research/selected-current-purpose-selector-result-2026-07-13.md`](../research/selected-current-purpose-selector-result-2026-07-13.md)
- [`../research/governing-source-selector-result-2026-07-13.md`](../research/governing-source-selector-result-2026-07-13.md)
- [`../research/conditional-current-purpose-result-2026-07-13.md`](../research/conditional-current-purpose-result-2026-07-13.md)
- [`../research/exact-reason-conditional-default-result-2026-07-13.md`](../research/exact-reason-conditional-default-result-2026-07-13.md)

## Reconsideration triggers

Reconsider this topology only when one of these appears:

- two or more real eligible candidates require a stable decision that
  clarification/reversible choice cannot supply;
- exact reason plus bounded selected status repeatedly fails across distinct
  purposes and a validated structured constraint has real consumers;
- a model/provider-qualified arbitration mechanism materially outperforms the
  conditional default while retaining truthful fallback and provenance;
- a real Turn must resume after process restart; or
- learner-facing research shows that the default/override behavior itself is
  educationally harmful.

Do not reconsider because an Agent framework exposes plan state, a model can
emit a confident rationale, or a database table could store “current activity.”
