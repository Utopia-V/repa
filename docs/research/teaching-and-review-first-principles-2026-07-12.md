# Teaching and review from first principles

Date: 2026-07-12

Status: Phase-boundary source synthesis and design correction. The source
findings are informative evidence. The product consequences below are the
current working proposal under the accepted product foundation and ADR-0012;
they do not define a teaching algorithm, learner ontology, database schema, or
claim of improved human learning.

## Decision question

After course and material continuity, should Repa proceed by adding generic
records such as `explained range`, or should the next work be chosen from the
larger product outcome: helping a learner cross a real difficulty, adapt the
teaching, and return later in a useful way?

The answer affects more than naming. An entity-led sequence naturally grows
from course tables to activity tables, then Agenda tables, then evidence and
review tables. That is an orderly database build, but it can postpone the
product behavior those records are meant to support.

## Result

Coverage and route position are useful continuity mechanisms. They are not a
theory of learning and not the main product payoff.

The product-level outcome is:

> Make material that is currently difficult more tractable, then help the
> resulting knowledge remain available and useful under the learner's real
> goals and constraints.

Repa should pursue that outcome through flexible feedback, not through one
universal teaching pipeline. A Tutor interaction may begin with an answer,
overview, worked example, learner attempt, comparison, independent reading,
review, or real assignment. It may leave no durable learning record. When a
later consequence matters, its owning learning authority records only the
meaning that a real future behavior consumes.

In plain language: the system needs to know enough to stop losing the learner's
place and to make later help better. It does not need to turn every conversation
into a psychological diagnosis or every explanation into a database event.

## What the evidence supports

### Different learning changes need different instruction

The Knowledge-Learning-Instruction framework distinguishes memory and fluency,
induction and refinement, and understanding and sense-making. Its central
engineering consequence is not that Repa should copy those categories into a
schema. It is that an instructional mechanism earns no universal default merely
because it works for one kind of learning event.

Source:

- Koedinger, Corbett, and Perfetti,
  [The Knowledge-Learning-Instruction Framework](https://pact.cs.cmu.edu/pubs/Koedinger%2C%20Corbett%2C%20Perfetti%202012-KLI.pdf).

### A good explanation is an interaction, not polished prose alone

Research on instructional explanations reports that explanations often fail
when they do not fit prior knowledge or when they replace rather than support
the learner's own construction of meaning. Self-explanation research also
finds a meaningful difference between merely reading a solution and connecting
its steps to principles, conditions, and one's own uncertainty.

For Repa this supports adaptation to the current interaction and source, not a
stable `learning_style` profile. It also means explanation quality cannot be
scored from fluency or length alone.

Sources:

- Wittwer and Renkl,
  [Why Instructional Explanations Often Do Not Work](https://eric.ed.gov/?id=EJ784018).
- Chi et al.,
  [Self-Explanations: How Students Study and Use Examples in Learning to Solve Problems](https://doi.org/10.1207/s15516709cog1302_1).

### Guidance and sequence depend on the situation

Worked examples can reduce unproductive search for novices learning complex
procedures. The same guidance can lose value or become redundant as prior
knowledge grows. Conversely, in some bounded mathematics settings, attempting
a problem before instruction improved conceptual understanding and transfer.
Comparing solution methods can also improve flexibility when the learner has
enough knowledge to make the comparison meaningful.

These results do not settle a global order between explanation and attempt.
They establish the opposite: Repa needs reversible local judgment and feedback
instead of `teach -> practise -> master` or `always ask first`.

Sources:

- Sweller and Cooper,
  [The Use of Worked Examples as a Substitute for Problem Solving in Learning Algebra](https://doi.org/10.1207/s1532690xci0201_3).
- Kalyuga et al.,
  [The Expertise Reversal Effect](https://doi.org/10.1207/S15326985EP3801_4).
- Kapur,
  [Productive Failure in Learning Math](https://doi.org/10.1111/cogs.12107).
- Rittle-Johnson and Star,
  [Does Comparing Solution Methods Facilitate Conceptual and Procedural Knowledge?](https://doi.org/10.1037/0022-0663.99.3.561).

### Scientific review is purpose-sensitive

Retrieving knowledge can improve later retention and sometimes transfer more
than restudying it. Spacing matters, and the useful gap depends in part on the
intended retention horizon. Relearning across spaced sessions combines those
effects. Interleaving can improve discrimination among similar categories or
problem types, but experimental results also show that blocked study can be
better for other category structures. Therefore `interleaving` is not a synonym
for random mixing, and `spaced repetition` is not the whole review product.

Sources:

- Karpicke and Blunt,
  [Retrieval Practice Produces More Learning than Elaborative Studying with Concept Mapping](https://doi.org/10.1126/science.1199327).
- Butler,
  [Repeated Testing Produces Superior Transfer of Learning Relative to Repeated Studying](https://doi.org/10.1037/a0019902).
- Cepeda et al.,
  [Spacing Effects in Learning: A Temporal Ridgeline of Optimal Retention](https://doi.org/10.1111/j.1467-9280.2008.02209.x).
- Rawson, Vaughn, Walsh, and Dunlosky,
  [Investigating and Explaining the Effects of Successive Relearning on Long-Term Retention](https://doi.org/10.1037/xap0000146).
- Carvalho and Goldstone,
  [Putting Category Learning in Order](https://doi.org/10.3758/s13421-013-0371-0).
- Rohrer and Taylor,
  [The Shuffling of Mathematics Practice Problems Improves Learning](https://doi.org/10.1007/s11251-007-9015-8).

FSRS-like algorithms solve a narrower computational problem: predict recall
for repeated units from review logs and choose intervals under an optimization
objective. That may later be valuable for facts or fluent procedures with
repeatable observations. It cannot decide which representation will unlock a
concept, whether an authentic assignment exercised a capability, or what the
learner should understand next.

Sources:

- Su et al.,
  [Optimizing Spaced Repetition Schedule by Capturing the Dynamics of Memory](https://doi.org/10.1109/TKDE.2023.3251721).
- [Open Spaced Repetition project and current FSRS implementations](https://github.com/open-spaced-repetition).

### LLM assistance can improve task performance without improving learning

A large high-school mathematics field experiment found that an ordinary
GPT-4-style chat interface greatly improved assisted practice performance but
reduced subsequent unaided exam performance. A guarded Tutor that withheld
answers and used teacher-provided solutions and common mistakes removed most of
that harm, but did not produce a positive exam effect in that study.

A separate undergraduate physics RCT found strong immediate gains from a
carefully structured AI tutor. Its important implementation detail is that the
researchers did not rely on a system prompt alone: multi-part scaffolding was
program-sequenced, and expert-authored activities and solutions grounded the
model. The study covered two lessons and explicitly left long-term retention
and broader higher-order contexts open.

Together these studies support a real product distinction between helping to
finish work and helping to learn from it. They do not justify always withholding
answers: Repa also handles real work, and the learner may explicitly choose
direct help. They do justify keeping the current purpose and the learner's
cognitive role visible to the Tutor.

Sources:

- Bastani et al.,
  [Generative AI without Guardrails Can Harm Learning](https://doi.org/10.1073/pnas.2422633122).
- Kestin et al.,
  [AI Tutoring Outperforms In-Class Active Learning](https://doi.org/10.1038/s41598-025-97652-6).
- Wang et al.,
  [Tutor CoPilot](https://arxiv.org/abs/2410.03017).

## Product and architecture consequences

### Do not store a universal teaching process

The familiar sequence

```text
situation -> move -> interaction -> consequence -> later context -> next move
```

is a first-principles observation of feedback, not a set of mandatory runtime
stages. Repa must not add `Intervention`, `DifficultyStage`, or a global
pedagogical state machine merely to mirror the diagram.

Different interactions may expose different subsets of the loop. A direct
answer may end without a write. A learner attempt may immediately change the
next explanation. A revisit may become useful days later. A real assignment
may both finish required work and exercise something that otherwise needed
review.

### Keep difficulty interpretations transient by default

The following are useful questions for a model or reviewer:

- Is prerequisite knowledge missing?
- Is the current representation unhelpful?
- Is a complex procedure overloading attention?
- Can the learner execute a procedure but not choose when to use it?
- Is a prior model or misconception producing the error?
- Is the knowledge understood but difficult to retrieve later?
- Is the real blocker time, assignment pressure, or another constraint?

They are lenses, not an exhaustive taxonomy and not learner labels. A model may
propose one as a working explanation. The learner may simply ask for another
example without any diagnosis. Nothing above becomes a durable enum until a
specific later action cannot work honestly without preserving that distinction.

### Separate review, revisit, and evidence

- **Review** is a Tutor move: recall, explain, compare, apply, reconstruct, or
  use older material again.
- **Revisit** is a possible Agenda concern: there is a reason to return later,
  with a source, target, trigger or timing window, and a correctable lifecycle.
- **Evidence** is what an actual response or artifact supports under its
  conditions. Completing a review interaction does not automatically prove its
  target is retained or transferable.

In plain language: “come back to this” is a plan, “we came back to it” is an
event, and “the learner can now use it independently” is a separate inference.

Repa should not introduce a universal `FutureAction` table to unify revisits,
assignments, commitments, and every other future concern. ADR-0012 already
assigns these meanings to their domain authorities. The shared rule is only
that a durable record must name a future consumer and correction path.

### Preserve the accepted program/model split

| Program-owned or program-enforced | Model-led or mixed | Learner-owned |
| --- | --- | --- |
| trusted time, source and revision identity, current goals and constraints, legal transitions, due derivation, context bounds, correction, atomicity | interpret material and learner responses, research, propose or choose a local teaching move, explain, demonstrate, generate or adapt examples, suggest a revisit, initiate an authorized command | goals, immediate steering, whether to continue, interrupt, request direct help, ask for another explanation, or accept a trade-off |

Model-led does not mean model prose becomes authority. Program-owned does not
mean every teaching decision is scripted. A model may directly initiate an
authorized revisit or other domain command; the command still owns identity,
preconditions, provenance, and legal consequences.

### Resolve authority conflicts without rewriting the map

An urgent exam or assignment may redirect today's attention. It does not turn
the short-term route into a prerequisite graph or erase long-term course
structure. Likewise, a source-grounded course relation does not force the
learner to follow it when they knowingly choose a different immediate goal.

The current view should expose the conflict and its sources. The Tutor can
propose a bridge or trade-off; each authority changes only through its own
command.

## Representative behavior pressure

These are architecture probes, not scripted lessons or future database rows.

| Situation | Useful variation in Tutor behavior | Prohibited compression | Possible future-relevant consequence |
| --- | --- | --- | --- |
| A novice cannot execute a multi-step procedure | orient briefly, demonstrate a worked case, expose subgoals, then reduce support as interaction permits | force an unaided problem immediately or mark the procedure mastered after watching | route/material continuity; perhaps a later independent attempt if it serves the learner's goal |
| The learner can perform steps but says the idea still makes no sense | change representation, connect steps to a principle, compare cases, invite a prediction or self-explanation when useful | repeat the same wording or classify the learner permanently as a “visual learner” | an unresolved question or revisit only if returning later would improve behavior |
| The learner knows several methods but chooses the wrong one | contrast confusable cases or methods and later mix them when discrimination is the target | random interleaving of unrelated topics | a source-linked attempt or specific revisit when later selection should respond |
| Material was understood earlier but is no longer readily available | attempt retrieval, give feedback or relearn, and space another return according to the intended horizon | reread-only review, automatic mastery, or one universal interval algorithm | the actual result plus an explicitly served, dismissed, or rescheduled Agenda concern when later behavior consumes it |
| A real assignment is due and the learner asks for direct completion help | help directly to the degree requested, make the learning trade-off visible, and preserve only worthwhile future work | obstruct the learner with mandatory Socratic questioning or silently claim learning from AI-produced work | assignment progress, a deferral, or a later learning concern under Agenda authority |

The cases pressure different teaching choices while sharing one Agent loop.
They prevent either a worked-example policy, a retrieval policy, or a
question-first policy from becoming the architecture.

## Roadmap alternatives

### Entity-linear sequence

Build learner activities, then Agenda, then evidence, then review. This gives
clean local dependencies but makes database entities the product order. The
current `Phase 2 -> Phase 3 -> Phase 4` roadmap has this failure mode and should
not remain active.

### Outcome-only vertical slices

Build whichever end-to-end learner experience looks most valuable. This keeps
product value visible but can duplicate state, hide failure behavior in prompts,
and erode the accepted authority boundaries.

### Product pressure paths over engineering gates

This is the recommended structure.

The upper axis names a learner-visible capability under pressure: teaching a
difficult idea, returning later, handling an assignment, or continuing across
courses. The lower axis applies the same architecture gates every time:
authority, source/revision, current context, commands, correction, failure,
recovery, and bounded detail.

In plain language: decide what useful learning behavior to prove, then build it
through the architecture rather than around the architecture.

Product outcome names remain roadmap language. They do not become runtime
entities such as `UnderstandingState`, `TransferStage`, or `LearningMode`.

## Evidence still required

No additional model-only experiment is required to reject the entity-linear
roadmap. Existing B2 and production dogfood already show that one Agent loop can
teach, use compact state, call learning commands, and continue across Sessions.
Another simulated learner or LLM judge cannot establish teaching quality,
retention, or transfer.

The B1 deterministic lab has also already demonstrated a basic revisit
lifecycle: schedule, derive due state from time, complete or cancel from a later
source, reopen, reschedule, correct, and survive reopen. B2 showed a due revisit
entering compact context and changing a live model interaction. That evidence
should be reused as an oracle, not copied as a production schema. What remains
unproven is the educationally important part: retaining enough purpose and
alignment to choose an appropriate form and decide whether later work genuinely
served the revisit.

The next product pressure path should separate its claims:

- deterministic tests establish source binding, Agenda/revisit transitions,
  context selection, correction, retry, crash, and fresh-Session behavior;
- model-behavior trials establish whether the shared Tutor policy notices the
  supplied intent, state, and constraints and changes its move without a
  hard-coded lesson workflow;
- qualitative review checks factual correctness, relevance, representation,
  adaptation, and whether the learner still performs the intended cognitive
  work; and
- only real learner interaction and delayed or transfer behavior can support a
  claim that Repa improved learning.

This means production may implement the reliable control boundary before the
project can claim educational effectiveness. The claim must remain honest.

## Independent review disposition

A private GPT-5.6 Pro adversarial review was used as architecture-review
evidence, not authority. The following corrections were adopted:

- describe feedback as a family of interactions, not stored intervention
  stages;
- keep difficulty lenses transient;
- keep roadmap outcome names out of the runtime ontology; and
- make conflict among learner intent, course structure, and material authority
  explicit.

Two suggestions were rejected:

- a universal `FutureAction` would recreate the generic fact/action center
  already rejected by ADR-0012; and
- limiting the model to proposals only would contradict the accepted
  mixed-initiative command boundary. The model may initiate a legal local write
  while the domain retains durable authority.

## Decision for the current build map

1. Remove the standalone activity/progress phase as the automatic next step.
2. Keep completed course continuity as infrastructure and verified product
   behavior, not as the product center.
3. Make the next pressure path teach, adapt, and later return to one difficult
   part of real material, with contrasting cases that prevent one pedagogy from
   becoming mandatory.
4. Let that path earn only the learner-history, Agenda/revisit, evidence, and
   context distinctions it actually consumes.
5. Re-evaluate the complete product after the path exits; do not automatically
   extend whichever new table or module was most recently added.

The follow-on deterministic pressure result is
[`teach-adapt-return-architecture-proof-2026-07-12.md`](./teach-adapt-return-architecture-proof-2026-07-12.md).
It promotes a source-linked Agenda future-attention concern while keeping the
later activity, Agenda disposition, and learning evidence separate.
