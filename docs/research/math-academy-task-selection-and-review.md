# Math Academy task selection and review findings

Date: 2026-07-10

Status: Primary-source research. This document records observed behavior and
publicly described mechanisms; it does not make them Repa requirements.

## Research question

What actually happens when a learner answers incorrectly, how does ordinary
forgetting create review work, and which part of the system remains stable?

## Stable graph, changing learner profile

Math Academy describes one shared knowledge graph whose topics and relations
span multiple courses. A course is a selected region of that graph. A student's
answer history produces a knowledge profile over the graph; learner performance
does not rewrite the graph.

The graph is not immutable. Its authors report that topics, problem metadata,
prerequisites, and encompassing relationships are handcrafted and refined over
years. That makes it a high-inertia curriculum artifact maintained by domain
authors, not a per-learner state.

Sources:

- [How Our AI Works](https://www.mathacademy.com/how-our-ai-works)
- [How Math Academy Creates its Knowledge Graph](https://www.justinmath.com/how-math-academy-creates-its-knowledge-graph/)

## An incorrect answer has task-specific meaning

The public behavior does not support a universal `failure -> repair` rule.

### Adaptive diagnostic

Correct and incorrect answers propagate weighted positive and negative evidence
through related topics to estimate a knowledge frontier. Conflicting evidence
is retained and weighted. Public material does not say that each diagnostic
error immediately starts remedial teaching.

### Lesson or practice

An incorrect answer initially increases the amount of practice required in the
current task. Too many errors halt the lesson and make it available again later.
Only another halt at the same point without forward progress triggers targeted
review of relevant foundations.

### Periodic quiz

A quiz audits previously learned topics. After the quiz, an incorrect or
over-time topic is scheduled for immediate review; after the review, a retake
with different questions may become available.

Sources:

- [How Our AI Works](https://www.mathacademy.com/how-our-ai-works)
- [Math Academy FAQ](https://www.mathacademy.com/faq)

## Review is continuous and may be implicit

Quiz remediation and ordinary spaced review are separate sources of review
pressure. A topic can become due through predicted forgetting even when no new
error occurred.

An explicit review is not always required. When a more advanced task actually
exercises a simpler component skill, the advanced task can supply discounted or
full implicit repetition credit through an `encompassing` relation. A mere
prerequisite relation is insufficient because a prerequisite may be needed to
understand a task without being practiced by it.

The public FIRe description exposes a high-level time-decay and repetition
model, but not the proprietary parameters, thresholds, candidate scoring, or
tie-breaking policy.

Sources:

- [Optimized, Individualized Spaced Repetition in Hierarchical Knowledge Structures](https://www.justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures/)
- [Math Academy FAQ](https://www.mathacademy.com/faq)

## Task selection is not three queue rotation

Public descriptions identify several candidate sources:

- new topics at the learner's knowledge frontier;
- naturally due reviews;
- quiz remediation;
- remediation after repeated lesson failure;
- periodic quizzes.

One task can satisfy more than one reason. A new or advanced task may also cover
due reviews, and multiple due reviews can be compressed into one task. The
system also interleaves dissimilar topics and delays missing foundations until
they become necessary for progress.

Math Academy normally presents several tasks from which the learner can choose.
The concrete scoring function, hard priorities, quotas, and tie breakers are not
public.

Sources:

- [How Our AI Works](https://www.mathacademy.com/how-our-ai-works)
- [How It Works](https://www.mathacademy.com/how-it-works)

## Transferable conclusions and non-conclusions

The evidence supports these design observations for Repa:

1. Curriculum structure and learner-specific evidence have different owners.
2. Task purpose and conditions are required to interpret an answer.
3. Time changes review priority without creating a new learning observation.
4. New learning, review, and remediation are candidate reasons, not necessarily
   mutually exclusive task types.
5. An advanced task may satisfy a simpler review only when the task alignment
   says the simpler skill was actually exercised.

It does not establish:

- that Repa should reproduce Math Academy's graph or FIRe model;
- that arbitrary LLM-generated topic relations are reliable enough for implicit
  review credit;
- that every domain supports topic-level objective assessment;
- the correct initial task-selection weights for an open local workspace.
