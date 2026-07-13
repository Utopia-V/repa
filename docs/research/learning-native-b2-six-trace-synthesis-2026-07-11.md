# Learning-native B2 six-trace synthesis

Date: 2026-07-11

Status: Phase B2 is locally complete as an integration exercise. Its raw model
bundles are Git-ignored, so this is not a frozen benchmark artifact, not the
formal three-condition comparison, and not an educational-effectiveness claim.
The traces used scene-specific Tutor policies and do not prove default action
selection or product completeness. In particular, Trace 5's 45/25/30-minute
emergency is outside Repa's product scope rather than a low-priority Assignment
scenario; see
[`semantic-drift-audit-2026-07-13.md`](./semantic-drift-audit-2026-07-13.md).

## Result

One experimental learning layer and one generic AI SDK Agent loop completed the
six accepted behavior traces:

1. begin a course, teach, and accept learner steering;
2. demonstrate an operation, let the learner follow it, then explain its
   principle;
3. allow independent reading without taking over;
4. respond to a scripted wrong answer with a deterministic task result and
   create one local revisit;
5. let a source-linked virtual deadline change the short plan; and
6. reopen days later and continue from compact local state.

The later contexts were produced from earlier committed facts and virtual time.
No run received a hand-written ideal summary, mastery score, hidden learner
truth, or expected next action masquerading as learner state.

## What was reused

The following remained generic Agent machinery:

- provider calls and streaming-compatible message shapes;
- multi-step tool continuation;
- Zod tool-input validation;
- finite step limits;
- complete AI SDK assistant/tool message replay between turns; and
- raw Session text retention.

No trace required a learning-specific model loop, workflow engine, agent
framework, or separate runtime for teaching, review, planning, and assignment
work.

## What the learning layer had to own

The smallest demonstrated learning-owned responsibilities were:

- active course, broad route, and current section;
- simple distinctions among `read`, `explained`, `demonstrated`, and `followed`;
- reported attempt outcome, declared assistance condition, and source;
- pending revisit identity, due time, and provenance;
- assignment deadline and resolution state;
- routine context assembly from those facts and the current time; and
- source paths back to raw Session detail when the next action needs it.

Under scene-specific Tutor policies, these facts were sufficient inputs for
standing by during self-study, distinguishing watching from doing, returning
to a due local gap, protecting an imminent submission, and understanding
`继续` without learner resynchronization. B2 did not test whether the state
alone improves default action selection; that is a Phase C comparison question.

## What was not needed

The traces did not require:

- mastery or confidence scores;
- a complete topic graph;
- a universal knowledge ontology;
- mandatory testing after explanation;
- a detailed lesson state machine;
- a persistent plan table;
- eager loading of materials or old Sessions;
- an FSRS integration;
- a general scheduler score; or
- a second Agent framework.

This does not prove those mechanisms will never be useful. It means the current
behavior baseline does not yet justify them.

## Tutor-policy findings

Several failures were Tutor-policy failures rather than state-model failures:

- a model can read the correct material and still overstate a local rule;
- learner steering needs priority over the model's impulse to add adjacent
  useful content;
- deliberately layered teaching should name the scope of a simplified rule
  without prematurely teaching every exception;
- self-study should remain self-study;
- plans need concise output constraints or a correct decision can be buried or
  truncated; and
- a temporary deadline trade-off must not become a learner trait.

These belong in the shared Tutor skill and qualitative review. They do not
justify more learner-state fields.

## Experiment-method findings

The first deterministic oracles were sometimes too lexical. They rejected
correct behavior because of word order, English `min`, or distance between two
phrases. Every correction is recorded in the per-trace report, and corrected
outputs were replayed offline instead of repeatedly calling the model.

For Phase C:

- learner policies, semantic checks, counterexamples, and output bounds must be
  frozen before the comparison;
- checkers should inspect behavior and order rather than one preferred phrase;
- a raw automated pass never substitutes for qualitative teaching review; and
- model and evaluator failures must remain separate.

Pinned-material downloads also showed intermittent certificate failures. The
lab now retries once without disabling TLS verification.

## Cost and run scope

Twelve persisted cost-bearing B2 bundles reported a combined estimated upper-bound
cost of **$0.01896159** across 29 recorded model steps. This includes smokes,
revisions, and traces later replayed under corrected oracles. One failed Trace 2
request may have incurred unreported provider cost before its material-tool TLS
failure; the number is therefore a lab-side known-bundle estimate, not a billing
statement.

## What B2 proves

B2 proves that the current small learning-owned state is executable with real
model behavior and generic harness machinery. It is enough to represent a
credible learning-native condition in a later comparison.

B2 does not prove that this condition beats a mature general Agent with a good
learning skill. It does not measure retention, transfer, long-term human study,
or teaching quality across subjects.

## Next gate

Before Phase C runs, freeze:

1. the shared Tutor skill used by both the skilled-general and learning-native
   conditions;
2. the responsive learner policy;
3. the shared multi-Session scenario and virtual external events;
4. semantic scoring rules and counterexamples; and
5. the exact capability difference among the three conditions.

Only then should the project run the General Agent, General Agent with learning
skill, and Learning-native Agent comparison.
