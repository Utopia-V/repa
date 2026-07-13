# What the Tutor does

Date: 2026-07-11

Status: Product clarification from maintainer feedback. This document guides
future design. It does not define a database schema, agent workflow, or next
experiment.

## Starting point

The product serves a serious learner who wants to make steady progress. The
Tutor takes responsibility for much of the surrounding work:

- understand the goal and available time;
- find and organize suitable material;
- keep a useful view of the subject and the current course;
- choose a reasonable next learning move;
- teach, demonstrate, answer, and adapt;
- arrange practice and review when they help;
- notice gaps and revisit them;
- handle assignments, exams, and other real constraints; and
- remember enough of the past to make future help better.

The learner still performs the cognitive work: paying attention, trying,
remembering, explaining, solving, creating, and making connections.

The desired result ranges from remembering useful knowledge to understanding,
application, transfer, and longer-term subject judgment. A short-term exam or
deadline may temporarily change priorities.

## Product outcome: make difficult material learnable

One central product behavior is to make content that currently feels difficult
more tractable. That includes finding a useful entry point, choosing or changing
the representation, explanation, example, or activity, and returning later in a
way that helps the knowledge remain available and usable.

`Difficult` is relational: it depends on the material, goal, prior interaction,
current constraints, and the form in which the learner is encountering it. It
is not a permanent learner trait or a required diagnostic label. The learner may
simply ask for a different explanation, and the Tutor should respond without
first completing a classification ritual.

Scientific support does not imply one universal teaching or review recipe.
Worked examples, learner generation, comparison, retrieval, spacing,
interleaving, and real application solve different problems under different
conditions. The Learning System keeps purpose, history, time, sources, and
feedback connected; the model uses that setting to perform the flexible
teaching work.

Coverage tracking is supporting infrastructure. Knowing that a section was read
or explained can prevent needless repetition, but it is not evidence that the
content was understood, retained, or transferable, and it is not the product
outcome by itself.

## Available learning moves

The Tutor can:

- give an overview before details;
- explain an idea or answer a question;
- demonstrate a procedure or worked example;
- let the learner become familiar with an operation before explaining why it
  works;
- guide an attempt with hints or partial steps;
- ask the learner to explain, predict, solve, compare, or create;
- leave the learner to read, watch, code, write, or solve independently;
- review older material;
- investigate a repeated difficulty;
- connect previously separate ideas; and
- help complete real coursework while preserving worthwhile learning.

There is no universal order. A useful interaction may move among several of
these actions. The learner can interrupt, skip, ask for a different explanation,
or request direct testing.

## Teaching is part of the product

Teaching quality includes the choice of content, order, examples, level of
detail, representation, and response to the learner. The Tutor needs a broad
view of the route while retrieving detailed material only when it becomes
relevant.

Practice supplies useful feedback and supports memory or fluency. It does not
replace teaching. A check can happen through a question, prediction, teach-back,
worked problem, later application, or delayed review. The Tutor need not attach
a quiz to every explanation.

An explanation can remain valuable even when the system cannot infer a change
in ability from it. The Session preserves the interaction. Later behavior can
refer back to its source, content, and open questions without inventing a
precise mastery claim.

## What history is for

History exists to improve later help. Useful durable facts may include the
active goal, material used, activity chosen, learner response, observed help,
formal result, unresolved question, commitment, or scheduled revisit.

The system should keep raw local interactions available by reference. It may
derive small, correctable summaries when a future decision needs them. It does
not need to translate every teaching exchange into a universal evidence form.

Course structure gives the Tutor a broad route. Detail may be added lazily.
Learner difficulty can create local review or change the near-term sequence;
one error does not rewrite the whole route.

## What the recent benchmark changed

ALS-015 and ALS-016 tested a detailed representation of formal task results and
a small next-action selector. They found that known conditions help a model
interpret an answer, while the proposed detailed record remained unreliable.
The selector cases did not establish an advantage from durable learner state.

Those results constrain data claims. They do not make formal exercises the
center of the product, choose a teaching method, or define the first complete
Tutor interaction.

## Current consequence

The accepted generic runtime decisions remain useful. A review draft of the
complete interactions is now recorded in
[`03-complete-learning-traces.md`](./03-complete-learning-traces.md). They cover
teaching, operation-first learning, self-study, practice and later review,
deadline pressure, learner steering, and continuation across Sessions.

The earlier working model is
[`../proposals/0003-learning-native-responsibilities.md`](../proposals/0003-learning-native-responsibilities.md),
and its capabilities are made explicit in the review-draft
[`../proposals/0004-learning-native-capability-contract.md`](../proposals/0004-learning-native-capability-contract.md).
Only facts consumed by real interactions may become durable domain concepts.
ADR-0012 now promotes and refines the responsibility split into the accepted
whole-system architecture while preserving that consumer rule.

B1/B2 established bounded persistence, context, and live integration. ALS-017
later established that a model can directly initiate source-bound, correctable
learning writes while the system retains durable authority. The broad
three-condition comparison is no longer the automatic next phase; its failure
to start does not invalidate those narrower findings. ALS-018 then separated
physical invocation from semantic effect identity and promoted one scoped
learner-steering/context path into formal production code without choosing a
course ontology or turning temporary steering into a stable preference.
