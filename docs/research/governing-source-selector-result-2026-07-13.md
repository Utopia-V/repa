# ALS-022C governing-source selector result

Date: 2026-07-13

Status: Completed negative model ablation. The corrected source-choice enum
failed 10/18. Per the frozen stop rule, no further prompt or enum rescue for a
universal DeepSeek-V4-Flash selector is admitted.

## Result in plain language

ALS-022B failed partly because the model could choose only an Agenda concern or
vague `none`, then rewrite the concern's meaning. ALS-022C corrected that
design:

- code removed upcoming and superseded candidates;
- the model could select the exact current request, one unchanged Agenda
  candidate, or unresolved conflict; and
- the model could no longer author a replacement purpose or constraint.

The correction preserved provenance, but the selector still failed: **10/18**.
In both generic “continue this section” cases for independent prediction and
both generic repair cases, the model declared that the vague current request
was already sufficient and ignored the Agenda purpose. In both
multiple-candidate cases it also chose `current_request` rather than admitting
that the purpose remained unresolved.

That is the same product break from a different angle. A small general
classifier in front of the Tutor is not a reliable answer. Making
`current_request` explicit simply moved the bias from “always choose Agenda”
to “always call the learner's words sufficiently specific.”

## Frozen protocol

Nine cases ran twice, forward and reverse:

- expected exact Agenda source: generic independent prediction and generic
  repair;
- expected exact current request: explicit independent request, explicit
  discrimination request, deadline/direct help, cancellation, completed
  occurrence, and redirection; and
- expected unresolved: three materially different eligible concerns plus
  generic continuation.

Only eligible, current-view Agenda candidates reached the model. The output was:

```json
{
  "governingSource": "current_request | agenda_candidate | unresolved",
  "concernId": "visible id or null",
  "basis": "brief comparison"
}
```

The local admission function copied exact current learner text or exact Agenda
reason from the program-owned scenario. There was no field through which the
model could rewrite that meaning. The predeclared gate was 18/18. Failure ended
this selector-prompt line.

Executable artifacts:

- `labs/selected-current-purpose-pressure/source-selector-protocol.ts`
- `labs/selected-current-purpose-pressure/run-source-selector.ts`

## Aggregate

| Measure | Result |
| --- | ---: |
| complete calls | 18/18 |
| JSON/schema valid | 18/18 |
| exact governing source | 10/18 |
| exact candidate identity | 12/18 |
| field consistency | 18/18 |
| locally admissible shape | 18/18 |
| strict pass | **10/18** |
| provider retries | 0 |
| estimated API cost | USD 0.00111188 |
| campaign cap | USD 0.02 |

Raw sanitized artifacts:

```text
labs/selected-current-purpose-pressure/.runs/source-selector-2026-07-12T17-51-00-767Z/
```

## Per-case result

| Case | Result | Observation |
| --- | ---: | --- |
| generic continue + independent concern | 0/2 | selected `current_request`; called “continue” sufficient and explicitly declined Agenda |
| explicit independent request | 2/2 | selected exact current request |
| explicit discrimination request | 1/2 | one selected matching Agenda source instead of current request; meanings were compatible but provenance differed |
| generic continue + repair concern | 0/2 | selected `current_request`; lost the representation-change purpose |
| deadline/direct answer | 2/2 | selected current request |
| explicit cancellation | 2/2 | selected current request |
| multiple ambiguous concerns | 0/2 | selected generic current request instead of unresolved |
| already-completed input | 1/2 | one selected the matching concern; meanings were compatible but service/current-input provenance differed |
| learner redirect | 2/2 | selected current request |

The two compatible-provenance disagreements are not the decisive failure. Even
if they are credited, the selector remains 12/18 because it fails every
underspecified generic continuation and every unresolved multiple-candidate
case.

## What is now rejected

For DeepSeek-V4-Flash and the demonstrated inputs, do not put a universal
control classifier in front of every relevant Tutor turn and ask it to settle:

```text
current request versus Agenda versus clarification
```

Changing `none` to better labels and forbidding semantic rewrite did not solve
the core judgment. No further selector prompt, option wording, few-shot
example, relaxed threshold, or immediate retry is admitted.

This does not prove that no stronger model can ever arbitrate. It shows that
the current production-default model cannot be the sole reliable authority for
this general control decision, and that architecture must stay correct when a
model proposal is wrong.

## Architecture consequence

Selection should not be one mandatory preliminary stage for all Tutor turns.
Instead, composition should preserve the asymmetry of what is already known:

1. **Program-known legality** — eligibility, target freshness, source/version,
   and candidate count are deterministic. The program filters and binds them.
2. **Exact current request** — explicit direct help, cancellation, redirection,
   and a completed occurrence should continue through the ordinary Tutor path;
   they do not need a second model to re-authorize the learner.
3. **Agenda default opportunity** — a sole legal, eligible candidate may supply
   a default purpose when the current request is merely continuation, but that
   default remains subordinate to an incompatible explicit request.
4. **Real ambiguity** — several materially different candidates are not
   silently collapsed into one model guess. Clarification or another
   reversible ordinary Tutor move remains available.
5. **Open semantic realization** — once an exact source is bound, the model
   chooses wording, example, question, explanation, and tools.

The remaining uncertainty is therefore not another selector schema. It is
whether a program-selected *conditional default* can coexist with current
learner-request priority in the realizing sample:

```text
one legal Agenda concern -> bind exact reason as default
explicit incompatible learner request -> learner request wins, concern stays open
generic continuation -> default governs
```

That is a different control architecture from ALS-022B/C: no extra classifier
sample, no model-authored selection receipt, and no hidden selector controller.
It can be tested directly against generic continuation and explicit override
cases. If it fails, the default cannot be safely promoted and the project must
use more explicit learner clarification or a separately justified stronger
control mechanism.

## ALS-022D frozen gate

The conditional-default proof runs five Agenda-present cases twice:

- generic continuation must produce a purpose-valid unaided prediction;
- deadline/direct help must give and explain the requested output without
  forcing a prediction;
- an explicit direct-comparison form must compare and explain rather than
  quiz;
- an already-completed independent occurrence must use the ordinary Agenda
  address path rather than pose a new prediction; and
- learner redirection must leave object identity alone and keep the concern
  open.

All ten must pass the behavior and state expectation. The exact Agenda reason,
production Tutor loop, model, course, tools, and persistence remain unchanged;
only the conditional-default contribution is added. There are zero retries, no
review model, no follow-up repair, and a USD 0.02 cap.
