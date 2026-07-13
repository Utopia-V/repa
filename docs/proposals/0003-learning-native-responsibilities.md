# Learning-native responsibilities

Date: 2026-07-11

Status: Historical working model derived from the complete learning traces.
Its responsibility split informed ADR-0012 and the architecture-led build map;
those later documents now govern production. This file does not authorize
packages, interfaces, tables, or an implementation sequence.

## Question

What must this project own for learning to be a first-class part of the agent,
rather than a prompt and a few tools installed in a generic terminal agent?

## Working answer

The system should routinely maintain enough information to answer:

```text
What is the learner working toward?
Where are they in the relevant course or material?
What currently deserves attention?
What source detail should be retrieved for the next move?
```

The answer need not be a complete model of everything the learner knows. It is
a small, current view used to continue teaching, surface review, notice local
gaps, and account for real deadlines.

"Current view" names the information assembled for a Turn. It is not yet a
stored object, table, summary file, or new source of truth. Its facts may have
separate owners and can be queried when context is built.

## Responsibility split

| General agent responsibility | Learning-owned responsibility |
|---|---|
| Session and Turn lifecycle | Active learning goal and course |
| Provider calls and streaming | Broad course or material route |
| Tool-call continuation | Current material position and progress |
| Cancellation and interruption | Due review and specific pending revisits |
| Permission evaluation | Assignments, exams, deadlines, and time budget |
| Raw transcript persistence | Meaning of read, explained, attempted, and reviewed when retained |
| Transcript and file search | Learning-focused context assembly |
| Generic summaries and stable preferences | Tutor defaults for teaching, demonstrating, practising, reviewing, and planning |

The left side should use mature interfaces and libraries where possible. The
right side gives the product its reason to exist and remains owned by this
project.

## Observable difference

After several days away, a generic agent with Session search may be able to find
an earlier conversation after being asked. A learning-native Tutor should
already know the active course position, due review, unfinished work, and
deadline pressure when the learner says "continue." It then retrieves old
detail only if the chosen action needs it.

If the product requires the learner to restate that background or to ask for a
special memory search on every return, learning is still an optional workflow.

## Current context in three depths

### Routinely available

- active goal and course;
- broad route and current position;
- near-term due review or revisit;
- unresolved work and deadlines; and
- a small number of stable learner preferences.

### Loaded for the current learning move

- the relevant material range;
- recent progress or task results that change the move;
- the active assignment or review item; and
- source references needed to explain the reason for the move.

### Retrieved only when needed

- full previous explanations;
- complete attempts and tool results;
- older Sessions;
- detailed material outside the current range; and
- superseded or corrected interpretations.

The split follows the source findings in
[`../research/agent-memory-patterns-for-learning.md`](../research/agent-memory-patterns-for-learning.md).

## A durable fact needs a future consumer

| Candidate fact | Future behavior that can justify keeping it |
|---|---|
| Active goal | Select the relevant course and adjust priorities |
| Current material position | Resume without repeating or skipping content |
| Range read or explained | Avoid an unnecessary first introduction and retrieve the right source later |
| Actual task or review result | Give suitable feedback, revisit a gap, or adjust later review |
| Due revisit | Surface review at an appropriate later time |
| Assignment and deadline | Change the near-term plan |
| Stable preference | Change teaching form or interaction style across Sessions |
| Source reference | Recover detail, inspect a claim, and correct a summary |

If no future action consumes a proposed fact, it stays in raw Session history.
This rule is the main defense against turning every interaction into a schema.

## Tutor choice remains flexible

The current view constrains and informs the next action. It does not prescribe a
global learning state machine. The Tutor may orient, explain, demonstrate,
retrieve material, guide work, invite independent work, practise, review,
repair a gap, or help with an assignment.

Code should enforce authority and durable transitions where they exist. The
model can make local teaching choices using the current course view, material,
history, and learner steering. A fixed sequence is introduced only for a
bounded operation that truly has one.

## Minimal progress without inflated claims

The traces support simple facts such as:

```text
this material range was read
this range was explained
this operation was demonstrated
the learner followed this operation
this task was attempted under these relevant conditions
this revisit is due
```

The wording above is behavioral, not a proposed enum. Read, explained, and
demonstrated do not imply mastery. An attempt carries additional conditions only
when they change future feedback or scheduling.

## Relationship to generic memory

General memory owns searchable history, compact summaries, and stable personal
preferences. Learning-owned state supplies course semantics and time-sensitive
continuation. The learning layer can point into agent memory; it should not copy
whole conversations into a second authority.

This boundary leaves room for later memory improvements without making an
LLM-generated memory file the course planner or learner model.

## What remains unearned

The behavior traces do not yet justify:

- a complete topic graph;
- a universal mastery or confidence model;
- a detailed evidence ontology;
- a generalized scheduler score;
- one record for every explanation or question;
- a model-generated global learner portrait;
- a workflow graph for an entire learning Session; or
- a particular package or database layout.

Any of these may be introduced later when two real behaviors require the same
concept or an experiment shows that a simpler representation fails.

## Historical next falsifiable question (superseded)

The broad three-condition comparison below was the proposed next phase when
this working model was written. It did not start and is no longer the automatic
next step. B1/B2 and ALS-017 supplied narrower executable evidence, while
ALS-017 exposed time-scoped learner directives and semantic write idempotency as
more immediate boundaries. The text remains as research history, not an active
instruction.

The product target is specified separately in
[`0004-learning-native-capability-contract.md`](./0004-learning-native-capability-contract.md).
The comparison below cannot run until an experimental learning-native condition
implements that contract with real persistence and context assembly. Manually
injecting the expected current view would not represent a learning Agent.

The next experiment should compare three conditions over the same multi-session
scenario and responsive learner policy:

1. a capable general terminal agent with the same model, files, search, code
   execution, generic tools, Session persistence/search facilities, and compact
   memory;
2. the same general agent with a strong reusable learning skill that states the
   intended Tutor behavior but adds no learning-owned durable semantics; and
3. the same generic machinery and exact same learning skill as condition 2,
   plus the learning-owned course position, progress, revisits, real-world
   constraints, context assembly, and defaults described above.

The primary comparison is the second condition against the third. The first
condition shows how much a good learning prompt or skill contributes on its
own. This avoids weakening the baseline merely to make a dedicated learning
layer look useful.

The initial situation, materials, clock, external events, and learner policy are
shared. Transcripts may diverge because different Tutor actions require
different valid learner responses. The learner policy cannot see condition
identity or reveal hidden state.

The comparison must include teaching, self-study, practice, delayed review, a
deadline, learner steering, and a return after several days. It should measure
observable differences such as:

- whether the Tutor forms and preserves a useful course-level view;
- whether it resumes at a sensible place;
- whether it surfaces a due revisit without being reminded;
- whether it retrieves the right old detail only when needed;
- whether it avoids treating explained or read as mastered;
- whether it chooses among teaching, demonstration, independent material,
  practice, review, gap repair, and deadline work for learning-specific
  reasons;
- whether it preserves teaching as a normal option rather than sending every
  interaction into practice; and
- how often it asks the learner to restate facts already available locally.

If the skilled generic agent performs the same and the learning layer changes
no useful action, the proposed dedicated mechanisms have not earned production
status. If the learning layer helps, only the responsibilities and facts
actually used in those improvements should enter the first architecture
proposal.
