# ALS-022B selected-purpose selector result

Date: 2026-07-13

Status: Completed negative selector result. The tested `Agenda candidate | none`
projection is rejected. No prompt repair or rerun is authorized. The failures
change the selection representation before any production implementation.

## Result in plain language

The model can follow a properly selected learning purpose; ALS-022A showed
that. The next question was whether it could decide when an Agenda concern
should become that purpose.

The first selector shape was too weak and the model was unreliable: **12/22
strict passes**. It sometimes chose the old learning concern even when the
learner asked for a direct answer, redirected to another task, had already
completed the requested prediction, or when the concern was not yet eligible
or pointed at a superseded course view.

More importantly, the output shape allowed a semantic lie. In one deadline
case the model selected the *independent-prediction* concern ID, then rewrote
its “operative purpose” to mean *give the direct answer now*. The identifier
looked source-bound, but its meaning had been inverted.

That is not solved by asking the model more sternly. The program must narrow
the legal option set and preserve source meaning structurally:

- filter upcoming and superseded concerns before semantic arbitration;
- make the current learner request an explicit possible governing source,
  rather than hiding it behind vague `none`;
- represent unresolved conflict explicitly instead of forcing a concern or
  `none`; and
- let the model choose a source, but do not let it rewrite the authoritative
  meaning of that source.

In short: program supplies the legal choices and binds exact meaning; model
does the open semantic comparison.

## Protocol

ALS-022B used DeepSeek-V4-Flash with thinking disabled. Eleven isolated cases
ran twice, once forward and once reverse:

- positive adoption: generic independent prediction, explicit independent
  prediction, explicit discrimination, and generic repair;
- semantic non-adoption: deadline/direct answer, explicit cancellation,
  multiple ambiguous concerns, already-completed input, and learner
  redirection; and
- legality non-adoption: upcoming-only and superseded-target concerns.

The model returned one side-effect-free JSON object:

```json
{
  "decision": "adopt | none",
  "concernId": "visible id or null",
  "operativePurpose": "short purpose or null",
  "learnerRoleConstraint": "material constraint or null",
  "basis": "brief reason"
}
```

The use of JSON plus local Zod validation followed ALS-014. It tested semantic
arbitration without prematurely choosing production tool transport. The gate,
frozen before live calls, required 22/22 exact on decision, concern identity,
field consistency, and purpose-specific constraint. There were no retries,
repairs, LLM reviews, or follow-up samples.

Executable protocol:

- `labs/selected-current-purpose-pressure/selector-protocol.ts`
- `labs/selected-current-purpose-pressure/run-selector.ts`

## Aggregate result

| Measure | Result |
| --- | ---: |
| completed calls | 22/22 |
| valid JSON plus local schema | 22/22 |
| decision exact | 14/22 |
| concern identity exact | 14/22 |
| field-shape consistency | 22/22 |
| purpose/constraint check | 12/22 |
| strict pass | **12/22** |
| provider retries | 0 |
| estimated API cost | USD 0.00147056 |
| campaign cap | USD 0.02 |

Raw sanitized artifacts:

```text
labs/selected-current-purpose-pressure/.runs/selector-2026-07-12T17-45-22-050Z/
```

## Case results

| Case | Strict | Observed failure |
| --- | ---: | --- |
| generic independent | 1/2 | one selected the right ID but reduced the operative purpose to generic object identity; prediction survived only in the copied basis |
| explicit independent | 1/2 mechanical | both decisions/IDs were correct; one valid English “No hint before answering” constraint was missed by the narrow regex |
| explicit discrimination | 2/2 | none |
| generic repair | 2/2 | one wrote string `"None"` instead of null for an immaterial constraint, but the adopted purpose was correct |
| deadline/direct answer | 1/2 | one selected the independent concern and rewrote its purpose to direct answer |
| explicit cancellation | 2/2 | none |
| multiple ambiguous | 0/2 | both arbitrarily selected repair instead of declining unresolved materially different purposes |
| upcoming only | 1/2 | one selected a not-yet-eligible concern |
| superseded target | 1/2 | one selected a concern whose target view was superseded |
| already completed input | 0/2 | both forward-selected the concern instead of treating the current occurrence/service path separately |
| learner redirect | 1/2 | one selected repair, then relabeled it as homework-submission help |

The strict aggregate is retained unchanged. Manual inspection found one
mechanical false negative in the explicit-independent case, while the generic
independent case genuinely failed to carry the prediction purpose in the
operative field. Even crediting the regex false negative—and even treating the
ambiguous and already-completed cases as debatable policy choices—does not
remove the deadline, redirect, upcoming, stale-target, and semantic-rewrite
failures.

## What the failures mean

### 1. `none` collapsed several different control outcomes

The model could choose only an Agenda concern or `none`. But `none` actually
stood for several meanings:

- the exact current learner request governs;
- no durable candidate is relevant;
- several candidates remain unresolved and the Tutor should clarify; or
- the current input is a completed occurrence to process rather than a future
  purpose to adopt.

Because the current request was not a named choice, the model sometimes chose
an Agenda ID and placed the current request's meaning inside it. This is not
just bad wording; the option space omitted a real control source.

### 2. Provenance without semantic immutability is false authority

Validating `concernId` is insufficient if the model can author an unrelated or
opposite `operativePurpose`. A source-bound selection must carry the exact
source reason and target unchanged. A model interpretation may be attached as
untrusted, Turn-scoped help, but it cannot replace source meaning.

The deadline and redirect failures are direct counterexamples. Both produced a
valid visible concern ID while assigning it the learner's incompatible new
request.

### 3. Deterministic legality should not be delegated

Eligibility and target freshness are already program facts. Upcoming and
superseded concerns should not be presented as adoptable choices and then
policed by prompt prose. They may remain visible in an awareness/correction
section, but the selector's legal option set contains only eligible,
current-view candidates.

This follows the existing architecture rule: models choose inside legal
capabilities; they do not define legality.

### 4. Selection and constraint compilation are separate uncertainties

Two outputs chose the correct independent concern but did not produce the same
quality of operative constraint. ALS-022A proves that a good bound constraint
can be realized. ALS-022B shows that asking the same model to both choose the
source and rewrite its meaning is not reliable enough.

The next shape should test source selection without authoring a replacement
purpose. The exact Agenda reason remains the primary selected meaning. Whether
a separate scoped interpretation is useful can be tested after source
selection works.

## Architecture correction

For a Turn where eligible durable candidates might conflict with the learner's
request, the narrow control result should be closer to:

```text
governing source =
  current_request
  | agenda_candidate(exact visible id)
  | unresolved
```

This is not a universal action enum. It is local arbitration among the three
real outcomes exposed by this collision:

- `current_request` binds the exact admitted learner input and does not borrow
  Agenda provenance;
- `agenda_candidate` binds the exact candidate ID, version, target, reason,
  and source without model rewrite; and
- `unresolved` adopts no candidate and permits a learner clarification or
  other reversible response.

The program first removes illegal Agenda choices. The model selects among the
remaining opaque sources. The program then binds exact source meaning into the
next context cut. Selection still does not address Agenda, create evidence, or
survive the Turn.

## Consequence and stop rule

ALS-022B rejects its own `candidate | none + model-authored purpose` shape. Do
not repair its prompt, relax its score, or rerun it.

One redesigned proof is justified because the failure revealed a missing
control source and a provenance violation, not because the score was low. That
proof must:

1. filter upcoming and superseded candidates deterministically;
2. offer `current_request`, exact candidate IDs, and `unresolved` as the only
   choices;
3. forbid model-authored replacement purpose/constraint fields;
4. bind exact source meaning only after local validation; and
5. reuse the semantic conflict cases without claiming integration or human
   learning.

If that corrected source-selection shape fails, no further prompt selector
rescue is admitted. The architecture must fall back to more program-owned
dispatch, explicit learner clarification, or a separately justified model or
control mechanism.

### ALS-022C frozen gate

The corrected proof uses nine cases twice: two underspecified requests that
should adopt an exact Agenda source, six explicit/current-occurrence requests
that should retain `current_request`, and one materially ambiguous case that
should return `unresolved`. Upcoming and superseded candidates are removed by
code and never offered as legal choices.

The gate is 18/18 exact source, candidate identity, field consistency, and
local admission. The model cannot output a replacement purpose or constraint;
accepted Agenda selection binds the exact stored reason. There are zero
retries, no repair, no review model, and a USD 0.02 cap. Failure ends live
selector prompt work as stated above.
