# Learning representation beyond topic mastery

Date: 2026-07-10

Status: Research synthesis and design hypothesis. This document is not an
accepted architecture decision.

## Research question

Math Academy makes learning operational through a fine-grained knowledge graph,
student model, diagnostic algorithm, spaced review, and task selection. That is
compelling for a learning agent, but it leaves a difficult translation problem:

- ordinary learning can feel diffuse, delayed, and integrative;
- a learner may accumulate many disconnected pieces before a subject suddenly
  "clicks";
- exam preparation has an explicit content distribution, task format, scoring
  rule, and time constraint, so readiness is easier to define;
- an open local workspace does not have Math Academy's exhaustively authored
  curriculum and calibrated exercise bank.

The question is therefore not merely whether the system should model a
`Topic` or a `Skill`. It is what the system is entitled to infer from an
observation, for which goal, and under what conditions.

## Conclusion

The earlier `Topic + Skill` framing is too crude.

The system should separate five things that are often collapsed into one
"mastery" value:

1. **Domain organization**: concepts, procedures, representations, strategies,
   integrative competencies, and their relationships.
2. **Learner claims**: fallible statements about what the learner can currently
   know or do, with scope, conditions, confidence, and provenance.
3. **Task families**: situations deliberately chosen to elicit evidence about
   one or more claims.
4. **Evidence events**: observed performance, self-report, explanation, review,
   artifact, or other occurrence and the conditions under which it happened.
5. **Goal models**: the criteria by which the same learner state is projected
   into "what should happen next," including an exam blueprint when one exists.

Topics remain useful for navigation, material mapping, and communication. They
should not automatically be the unit of mastery. Evidence should update claims,
not write a score directly onto a chapter heading.

This produces a practical distinction:

```text
domain map       describes the subject
learner claims   describe current, uncertain capability
task families    create occasions to observe capability
evidence events  record what actually happened
goal model       defines what progress or readiness means now
```

## What Math Academy actually operationalizes

Math Academy's public description is more sophisticated than a graph of
textbook headings.

Its knowledge graph stores topics, prerequisite relationships, variations of
problems within a topic, relevant background knowledge for particular
struggles, and even "sub-atomic" relationships within topics. A course is a
selected region of a graph containing hundreds of topics, while the full graph
contains thousands. Its student model overlays answer history on that authored
graph, and its task selector tries to maximize learning per unit time.

This is best understood as a **closed-world curriculum engineering system**:

- the domain has been decomposed by experts;
- tasks and their variations are authored against that decomposition;
- observed answers are dense and usually objectively gradable;
- prerequisite and encompassment relationships have operational meaning;
- the platform controls the sequence in which instruction and assessment occur.

That is why a fine-grained graph is useful. Its nodes are not a metaphysical
claim that human understanding consists of isolated atoms. They are engineered
handles through which the platform can select tasks and interpret answers.

Math Academy also explicitly addresses integration. Its "layering" policy moves
learners forward once prerequisites are ready so that later knowledge repeatedly
uses and reorganizes earlier components. It claims that this makes prior
knowledge more ingrained, organized, and deeply understood. It also distinguishes
prerequisites from *encompassed* components: an advanced task may require a
prerequisite without actually exercising it enough to count as review.

The distinction between general learning and exam performance is visible in its
own products. The SAT Fundamentals course repairs conceptual foundations,
whereas SAT Math Prep is described as a practice-only performance environment
using high-fidelity exam tasks to develop speed, accuracy, representation
switching, strategy selection, and performance under time pressure. The latter
is not a second theory of knowledge; it is a different objective and task
distribution layered over prerequisite knowledge.

Sources:

- Math Academy, [How Our AI Works](https://www.mathacademy.com/how-our-ai-works)
- Math Academy, [SAT Math Prep](https://www.mathacademy.com/courses/sat-math-prep)
- Math Academy, [How It Works](https://mathacademy.com/how-it-works)
- Math Academy, [Pedagogy](https://mathacademy.com/pedagogy)

## Why unconstrained "learning" is genuinely fuzzy

Learning is not directly observable. The system sees answers, explanations,
artifacts, latency, help use, review outcomes, and self-reports, then makes an
inference about an internal capability. The inference is necessarily conditional.

"Mastered operating systems" is not a useful state variable. Even "mastered
page-table translation" is incomplete unless it says something about:

- familiar versus novel problems;
- recognition versus unaided production;
- access to notes, hints, calculators, or code;
- immediate performance versus delayed retention;
- routine execution versus explanation and transfer;
- accuracy alone versus accuracy under a time constraint.

Pure or open-ended learning is also purpose-relative. Without an exam blueprint,
"better" can mean several different things:

- retain facts and procedures;
- recognize when a method applies;
- explain why it works;
- connect representations and concepts;
- transfer to a novel problem;
- generate examples, counterexamples, or new solutions;
- become prepared to learn the next layer efficiently.

These are related but not interchangeable. A single mastery number hides the
trade-off rather than resolving it.

## What "suddenly clicked" can mean

The subjective experience is real and useful, but it should not be implemented
as a hidden threshold reached by summing atomic topic scores.

Several different changes can produce the experience:

- previously separate facts acquire a common organizing schema;
- the learner recognizes which features of a problem are structurally relevant;
- verbal and procedural knowledge become coordinated;
- multiple representations become mutually translatable;
- a prerequisite becomes fluent enough to stop consuming working memory;
- new knowledge makes earlier material intelligible in retrospect.

Learning-science models already warn against equating all knowledge with uniform
atomic skills. The Knowledge-Learning-Instruction framework distinguishes facts,
rules with variable conditions, principles with rationales, and integrated forms
of knowledge. It also distinguishes memory/fluency, induction/refinement, and
understanding/sense-making as different learning processes. More complex or
integrative knowledge may only become inferable across tasks that vary in
context and complexity.

Accordingly, the system may record "this clicked" as a metacognitive report, but
it should seek confirming evidence appropriate to an **integrative claim**:

- explain the relationship among previously separate ideas;
- solve a structurally novel or transfer problem;
- distinguish a valid application from a tempting near-miss;
- move between symbolic, visual, verbal, and concrete representations;
- generate a useful example or counterexample;
- use the integrated knowledge while learning the next topic.

Passing one familiar exercise supports a narrower claim. Consistent performance
across these conditions supports an integrative one. The system need not deny a
learner's feeling; it simply avoids silently upgrading that feeling into a more
general capability than the evidence supports.

Sources:

- Koedinger, Corbett, and Perfetti,
  [The Knowledge-Learning-Instruction Framework](https://pact.cs.cmu.edu/pubs/Koedinger%2C%20Corbett%2C%20Perfetti%202012-KLI.pdf)
- Carnegie Mellon Eberly Center,
  [Teaching and Learning Principles](https://www.cmu.edu/teaching/principles/)
- Halford and Busby,
  [The Relation Between Structured Knowledge and Conceptual Understanding](https://doi.org/10.1016/j.cogpsych.2006.12.001)

## The useful assessment abstraction: claim, task, evidence

Evidence-Centered Design states the assessment problem plainly: infer what a
learner knows or can do from limited observations of what they say or do. It
separates:

- the **student/proficiency model**: what the system wants to infer;
- the **task model**: what situations can elicit relevant evidence;
- the **evidence model**: how observations in those situations support broader
  inferences.

ECD for Learning adds a pedagogical model: how the product attempts to cause
growth rather than merely measure current status.

This is a better conceptual foundation for the learning domain than assigning a
`mastery` field to every node. It also fits the existing decision that learning
state follows evidence while self-report, observation, inference, and action
remain distinct.

Sources:

- Mislevy et al.,
  [Design Patterns for Assessing Science Inquiry](https://files.eric.ed.gov/fulltext/ED483405.pdf)
- ETS, [Evidence-Centered Design for Learning](https://www.ets.org/research/policy_research_reports/publications/report/2011/imbu.html)

## General learning and exam preparation

The two should share one domain and evidence system but use different goal
models. They should not maintain contradictory copies of the learner.

| Dimension | General or exploratory learning | Exam preparation |
| --- | --- | --- |
| Target | robust capability and future growth | expected performance on a specified assessment |
| Content scope | open and revisable | constrained by an exam blueprint |
| Task distribution | varied contexts, explanation, transfer, projects, new layers | high-fidelity item families with known weights and formats |
| Time horizon | retention and later reuse | exam date and remaining study budget |
| Performance conditions | may allow scaffolding during learning, then withdraw it | mirrors permitted tools, pacing, scoring, and sustained load |
| Optimization | retention, transfer, integration, generativity, preparation for future learning | score gain, coverage, speed, accuracy, strategy, risk reduction |
| Stopping rule | inherently negotiable | readiness target, exam date, or marginal score gain |

An exam goal therefore needs an explicit `AssessmentBlueprint`, for example:

```text
content and skill weights
task families and representations
difficulty distribution
scoring rules and partial credit
time and tool constraints
known question-selection behavior
target score and risk tolerance
exam date
```

Exam readiness is a **projection** over claims under those conditions. It is not
the same as deep understanding. A learner can understand material but perform
poorly because retrieval is slow or the format is unfamiliar. Conversely, exam
performance can improve through format recognition and pacing without a
corresponding increase in broad transfer.

This means an exam-oriented policy can legitimately stop adding advanced new
content, choose representative timed tasks, repair high-weight gaps, and train
execution. A general-learning policy can continue layering, test transfer, and
accept tasks whose payoff lies in future learning rather than an immediate
score. These are policy and objective differences over the same evidence-based
learner model, consistent with modes being policy profiles rather than separate
runtimes.

## Proposed domain representation

The following is a design hypothesis, not yet a database schema.

### 1. Domain node

A human-meaningful element of the subject. Suggested kinds:

```text
concept
fact
procedure
representation
strategy
principle
misconception
integrative_competency
```

Nodes may have relations such as:

```text
prerequisite_for
component_of
encompassed_by
explains
contrasts_with
representation_of
integrates
applies_in
```

A textbook topic or course unit is a view over these nodes and materials, not
necessarily a claim that can be mastered wholesale.

### 2. Learner claim

A proposition the system may tentatively believe, for example:

```text
The learner can split a virtual address into page number and offset
for conventional page-table problems, without hints, when page size is
given as a power of two.
```

A claim needs scope and conditions rather than only a number:

```text
target
scope or applicability conditions
allowed support and scaffolding
recency
confidence
supporting and conflicting evidence
inference method and version
```

### 3. Task family

A reusable specification for situations that elicit evidence. It describes:

```text
claims targeted
surface and structural features
difficulty and novelty
representations used
scaffolding and allowed tools
time constraints
scoring or grading rule
common error interpretations
```

Individual generated exercises are instances. This distinction prevents an LLM
from generating a plausible-looking question with no stated evidential purpose.

### 4. Evidence event

An immutable occurrence with provenance:

```text
task or activity
learner response or artifact
independence, hints, tools, and time
scoring observation
possible error attributions
claims supported or contradicted
strength and uncertainty
```

The event does not itself declare a final mastery state.

### 5. Goal model

A goal supplies the objective by which tasks are selected. It may be:

```text
assessment blueprint
course completion objective
project capability
long-term domain development
short exploratory inquiry
maintenance or review obligation
```

The planner evaluates candidate tasks against the active goal, time horizon,
learner claims, review pressure, dependencies, and learner preferences.

## How to make this implementable without building an ontology cathedral

The open-workspace product cannot reproduce Math Academy's graph before it is
useful. The graph should begin sparse and become denser where actual decisions
need support.

1. Import course headings and materials as organizational nodes, without
   pretending they are calibrated mastery units.
2. Add claims and task families around real exercises, assignments, exam items,
   explanations, and observed errors.
3. Add dependency or integration relations only when they affect task choice,
   diagnosis, or explanation.
4. Preserve provenance and confidence on LLM-proposed nodes and relations.
5. Prefer a small verified model around the learner's current goal to a large
   generated graph that merely looks complete.
6. Allow the model to remain coarse in weakly assessable domains. A reading,
   discussion, design, or research activity can produce useful evidence without
   being forced into a five-question drill.

The first useful implementation boundary is therefore not "model an entire
course." It is:

```text
represent one goal
represent the claims that matter to it
represent a few task families that can elicit those claims
record evidence with conditions
select a materially different next action when evidence changes
```

That is a semantic vertical slice, not permission to build a disposable MVP or
collapse the architecture into one prompt and one table.

## Consequences for Agentic Learning System

1. Replace a universal `Topic.mastery` concept with evidence-backed claims.
2. Keep Topic/Course structures as useful human and curricular views.
3. Make tasks first-class domain objects, not transient LLM text.
4. Treat exam readiness as a goal-specific projection, not global knowledge.
5. Represent integrative capabilities explicitly; do not derive them by simply
   summing component scores.
6. Let "clicked" influence context and trigger a suitable transfer probe, while
   retaining it as self-report until broader evidence appears.
7. Use Math Academy as evidence for the value of fine-grained authored
   structures, layering, and task selection, but do not assume its closed-world
   graph can be generated automatically from arbitrary local files.
8. Keep learning policy adaptive to the kind of knowledge: spacing may suit
   memory and fluency; varied comparison, explanation, and transfer are needed
   for induction and integration.

## Remaining research questions

These need empirical prototypes or domain studies rather than immediate product
decisions:

- Which claim forms remain understandable and editable by ordinary users?
- How should conflicting evidence decay, combine, or remain unresolved?
- Which task features can an LLM label reliably, and which require authored
  rubrics?
- How should evidence from open-ended work such as programs, proofs, essays, and
  projects be represented without false precision?
- What is the smallest useful assessment blueprint that can be recovered from a
  syllabus, past papers, and user constraints?
- When does an integrative claim deserve its own node, rather than remaining a
  narrative hypothesis in the learning trace?

These are research questions for the system. They are not prerequisites that
must be pushed back to the user before engineering can begin.

The follow-up investigation of how such structures can be bootstrapped from
public curricula, open educational resources, model priors, and local course
materials is documented in
[`open-world-domain-modeling.md`](./open-world-domain-modeling.md).
