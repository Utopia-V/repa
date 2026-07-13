# ALS-022D conditional current-purpose result

Date: 2026-07-13

Status: Completed focused architecture proof. The conditional-default shape
passed the five frozen Agenda-present contrasts twice (10/10). This supports
the control relationship for the demonstrated independent-prediction concern;
it does not freeze a general Agenda-purpose compiler or production field list.

## Result in plain language

Two separate attempts to put a little classifier in front of the Tutor failed.
The successful design removed that classifier.

When the program sees exactly one legal, eligible Agenda concern, it can bind
that concern as a **conditional default** for the normal Tutor response:

```text
exact current learner request (higher priority)
        |
        +-- explicit and incompatible -> follow it; keep concern open
        |
        +-- generic continuation ------> use the exact Agenda purpose
        |
        +-- completed occurrence ------> process/address it truthfully
```

DeepSeek-V4-Flash passed all ten frozen cases:

- generic “continue” produced an unaided prediction without the answer;
- deadline/direct-help requests received the answer and explanation;
- explicit short-code comparison requests received comparison and explanation,
  not a quiz;
- completed independent predictions received feedback and correctly addressed
  the concern; and
- redirection to assignment submission left object identity alone and kept the
  concern open.

There was no preliminary selector sample, no model-authored selection receipt,
and no durable activity state. Program-known legality and candidate count chose
the default; the ordinary realizing model handled the current request's
semantic override.

## Why this is not a prompt rescue

ALS-022B and ALS-022C tried to make a separate model output an authoritative
choice. Both failed and remain failed. ALS-022D changed the control topology:

```text
rejected:
state + request -> selector model -> selected source -> Tutor model

supported for one-candidate pressure:
program filters state -> one conditional default + exact request -> Tutor model
```

The second shape has fewer moving parts, no hidden controller, no added model
latency, no semantic-provenance rewrite, and an ordinary override path for the
learner.

## Frozen protocol

All five cases used:

- the production `runTutorTurn` loop;
- a fresh Session with the same eligible independent-prediction Agenda concern;
- the same Course View and Markdown fixture;
- `tutor-default-v2`;
- DeepSeek-V4-Flash API with thinking disabled;
- production material and Agenda tools;
- zero provider retries; and
- the exact Agenda reason retained in the normal context.

One additional contribution was added to every model request in the Turn. It
marked the sole concern as the default for generic continuation, repeated that
the exact learner request has higher priority, prohibited reinterpretation of
the Agenda reason, and stated the demonstrated unaided-before-disclosure
constraint. The exact text is in
`labs/selected-current-purpose-pressure/conditional-default.ts`.

Five cases ran forward and reverse:

1. generic continuation;
2. deadline/direct answer;
3. explicit direct code-comparison form;
4. learner-reported complete independent occurrence; and
5. learner redirection to assignment-submission help.

The predeclared gate was 10/10 on learner-visible behavior and durable state.
There was no qualitative review model or repair run.

## Aggregate integrity

| Property | Result |
| --- | ---: |
| complete cases | 10/10 |
| behavior/state gate | **10/10** |
| provider retries | 0 |
| generic independent prediction | 2/2 |
| direct answer override | 2/2 |
| direct comparison override | 2/2 |
| completed occurrence and Agenda address | 2/2 |
| learner redirect | 2/2 |
| estimated API cost | USD 0.0105168 |
| campaign cap | USD 0.02 |

Raw sanitized artifacts:

```text
labs/selected-current-purpose-pressure/.runs/conditional-default-2026-07-12T17-57-15-070Z/
```

## Behavior and state details

### Generic continuation: 2/2

Both responses read the material, posed a clear alias/shallow-copy prediction,
waited for the learner, did not supply the numerical answer, made no learning
mutation, and left the concern open. One used a nested object and the other a
nested array.

The second response gave general outer-object facts before asking about nested
sharing, but did not disclose the nested-sharing result. It therefore left the
central prediction intact.

### Deadline/direct answer: 2/2

Both responses read the exact material, gave `2 2 1`, and explained reference
aliasing versus the new spread-copy outer object. Neither forced an independent
prediction. State revision stayed unchanged and the concern remained open.

### Explicit direct comparison: 2/2

Both responses followed the requested form: two short code contrasts with
outputs and explanation. Neither converted the Turn into a quiz. State revision
stayed unchanged and the independent-prediction concern remained open.

### Completed occurrence: 2/2

Both responses recognized the learner's explicitly unaided `2 2 1` prediction,
gave correct feedback, called only `address_future_attention`, advanced state
revision by one, and left zero open concerns. They did not claim mastery.

One response said the prediction purpose had been achieved and offered further
options. That is consistent with Agenda service, but remains weaker than a
claim of durable learning.

### Learner redirect: 2/2

Both responses asked which assignment platform the learner used. Neither read
the object-identity material, posed an object question, mutated state, or closed
the concern.

## Secondary output-quality finding remains

The two generic responses explicitly narrated internal terms such as “Agenda,”
“default purpose,” and the compatibility comparison, despite an instruction
not to narrate them. Tool preambles also remained visible in several responses.

This does not change the control/state result, but it means production wording
must not expose internal architecture vocabulary as Tutor dialogue. A user may
be reminded naturally—“上次你想先自己预测”—without seeing concern IDs,
policy precedence, or control traces. The current runner/prompt does not yet
guarantee that presentation quality.

## What is supported

For one legal Agenda candidate and the tested independent-prediction purpose:

1. the program can bind a conditional default without a separate selector
   model;
2. the exact current request can override that default in the ordinary Tutor
   sample;
3. override leaves the candidate meaning and disposition unchanged;
4. a completed current occurrence can take the existing Agenda address path;
5. generic continuation can preserve the intended learner role; and
6. the selected/default purpose can survive ordinary material-read
   continuation within the Turn.

## What is not supported

The result does not prove:

- how to choose among two or more materially different eligible candidates;
- that every Agenda reason can be compiled into an operative learner-role
  constraint from free text;
- that a sole eligible candidate should always become a default across goals,
  assignments, deadlines, and multiple courses;
- that another provider/model follows the same priority relation;
- that internal control prose can be reliably suppressed by instruction;
- that the exact projection fields should be durable;
- improved learning, retention, or transfer; or
- a permanent model provider.

The intervention explicitly restated the demonstrated
unaided-before-disclosure constraint. Therefore ALS-022D supports the priority
and conditional-default topology, not a general semantic compiler from any
Agenda `reason` string.

## Architecture consequence

The evidence now supports a narrow production direction:

- do not create a mandatory universal selector stage;
- deterministically filter illegal/stale candidates;
- when a demonstrated composition policy promotes one legal candidate, bind
  its exact ID/version/target/reason as a conditional default in the immutable
  context cut;
- keep the exact current learner request higher priority and preserve override
  without closing or rewriting the candidate;
- keep selection/default scope Turn-local and process-local unless a future
  restart consumer appears;
- let the realizing model choose wording, examples, explanation, questions,
  and tools; and
- treat multiple materially different candidates as unresolved until an
  evidence-backed ranking rule, reversible model choice, or learner
  clarification settles them.

No production implementation is admitted merely from this one reason type.
Before code, the selected-purpose projection needs a small contract design
that separates exact source meaning, optional operative constraint, priority,
scope, and override outcome without inventing a universal pedagogy enum. The
constraint compiler/generalization question remains explicit rather than being
hidden in prompt prose.

## ALS-022E frozen gate

One final representation ablation removes the manually restated
independent-prediction constraint. The production context still contains the
exact Agenda reason; the intervention only marks the sole legal concern as a
conditional default, tells the model to treat the exact reason as operative,
and preserves current-request priority. It contains no independent-prediction,
answer, or hint rule of its own.

Eight generic-continuation samples run with the same production loop and model.
7/8 or 8/8 purpose-valid predictions support exact reason plus composition
status as sufficient for this behavior and reject a new operative-constraint
field. 0-5/8 require stronger representation research; 6/8 is inconclusive.
There are zero retries, no repair or review model, and a USD 0.02 cap. No
further live experiment is admitted in this phase.
