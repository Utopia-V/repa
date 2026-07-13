# Learning-native capability contract

Date: 2026-07-11

Status: Review draft. This document defines what the learning product must be
able to do before choosing production types, packages, or algorithms. It is a
product capability contract, not an experiment protocol or architecture ADR.

Current scope note (2026-07-11): the capabilities remain a reviewable product
target. The three-condition comparison and capability-gate sequence near the
end are historical proposals, not the active roadmap. B1/B2 supplied bounded
mechanism/integration evidence, and ALS-017 established model-initiated durable
writes while exposing a continuation-policy failure.

## Purpose

The system is intended to be a learning Agent, not a general Agent that happens
to receive learning requests. This contract states the capabilities that must
be available as normal product behavior.

Generic agent machinery may implement part of a capability. The project only
needs to own the learning meaning, composition, and guarantees that generic
machinery does not supply. A capability counts when the complete behavior is
available to the learner; it does not need a custom subsystem merely to look
native.

## What sufficient means here

The capability set is sufficient for the current product definition when the
complete behavior traces can run without requiring the learner to:

- reconstruct course state from memory;
- restate progress, due review, or deadlines that the system already observed;
- manually search old Sessions before the Tutor can continue;
- translate natural learning activity into database commands; or
- leave the Agent and operate a separate planner or review application for the
  core loop to continue.

Sufficiency here means enough product capability to express the intended Tutor.
It does not prove that the chosen teaching is optimal or that long-term learning
outcomes improve.

## Generic capabilities assumed

The learning product may reuse mature implementations of:

- model calls and streaming;
- files, search, web access, code execution, and other tools;
- raw Session persistence and search;
- compact general memory and stable user preferences;
- permissions, cancellation, interruption, and recovery; and
- terminal rendering.

The contract below starts where these generic facilities stop.

## Capability 1: establish a course and retain its broad route

The Tutor can begin from a goal and one or more materials without requiring a
complete knowledge graph or lesson plan.

Required behavior:

- identify the active course or learning goal;
- obtain or propose a broad route from selected materials and known curriculum
  sources;
- retain the learner's current position in that route;
- retrieve local detail only when teaching reaches it; and
- distinguish accepted course structure from temporary learner difficulty.

A local error may change the near-term sequence or create a revisit. It does
not silently rewrite a source-grounded route.

Failure case: after one Session, the Tutor can continue only if the learner
again explains which course, material, and section were active.

## Capability 2: assemble learning context automatically

At each relevant Turn, the Agent can assemble the small amount of learning
context needed for the next action.

The available context can include:

- active goal and course;
- current material position and simple progress;
- revisits that are due or currently relevant;
- assignments, exams, deadlines, and available time;
- stable learning preferences; and
- references to details that can be retrieved lazily.

The assembled view is not required to be one stored object. The underlying
facts may have separate owners.

Failure case: all facts exist locally, but the learner must explicitly ask the
Agent to search each one before they affect behavior.

## Capability 3: choose among Tutor actions

The Tutor can choose and combine actions according to the course, learner
history, current goal, and constraints.

Available actions include:

- orient;
- explain;
- demonstrate;
- answer and clarify;
- guide an attempt;
- let the learner read, watch, code, write, or solve independently;
- practise;
- review;
- revisit a local gap; and
- handle an assignment or deadline.

No fixed global order is assumed. The learner may interrupt, skip, request a
different explanation, ask for direct practice, or change the immediate goal.

Failure case: the system routes every explanation into a quiz, or treats
practice as the default answer to every learning situation.

## Capability 4: teach with materials and adapt locally

The Tutor can use the course overview and relevant material to explain ideas,
choose examples, demonstrate procedures, and respond to questions.

Required behavior:

- ground teaching in the selected course or material when appropriate;
- adjust detail, representation, examples, and order in response to the
  learner;
- materially change the move when the learner reports that an explanation did
  not help, instead of merely repeating it or assigning a permanent learner
  type;
- allow operation-first and principle-first teaching when each is useful;
- retrieve earlier explanations or examples when they matter; and
- leave an explanation as a valuable learning action without demanding an
  immediate measurement.

Failure case: teaching is only free-form chat and has no connection to course
position, previous interaction, future continuation, or selected materials.

## Capability 5: retain simple progress without inflating it

The system can remember plain facts about what happened when those facts improve
future continuation.

Examples include:

- a section was read or watched;
- a section was explained;
- an operation was demonstrated;
- the learner followed an operation; and
- a task or review was attempted.

Read, watched, explained, demonstrated, and followed remain different facts.
None silently means mastered, retained, or independently usable.

The raw Session already preserves detail. A separate source pointer or richer
record is added only when a future consumer needs it.

Failure case: the Tutor either forgets all progress or turns every ordinary
interaction into a detailed ability claim.

## Capability 6: use real performance for feedback, revisits, and review

When the learner actually attempts a task or recall, the Tutor can use the
result to improve later help.

Required behavior:

- retain the actual result and assistance conditions when they change its
  meaning;
- distinguish a confirmed observation from a tentative error explanation;
- create a specific revisit when it has a future use;
- let time make an existing revisit due without inventing a new observation;
- allow a later task that genuinely exercises the same material to satisfy or
  reschedule the revisit;
- choose the later form according to its purpose—for example recall and
  feedback, contrasting cases, explanation, application, or relearning—rather
  than routing every revisit through one drill or scheduler;
- distinguish beginning a revisit, serving its future-attention purpose,
  cancelling it, and obtaining learning evidence; serving a scheduled check
  does not require a correct result, and serving an explanation-purpose return
  does not create evidence by itself; and
- keep local remediation separate from changes to the broad course route.

Failure case: one error becomes a global learner portrait, or an old gap never
reappears unless the learner remembers to request it.

## Capability 7: include assignments, deadlines, and time

The Tutor can make learning decisions in the presence of real coursework and
limited time.

Required behavior:

- know whether a task is open, completed, cancelled, overdue, or otherwise
  resolved;
- consider urgency, known learning value, goal relevance, and available time;
- temporarily reorder teaching, practice, and review;
- help with the task while preserving worthwhile learning when appropriate;
  and
- return deferred learning to consideration when the constraint changes.

Passing a deadline does not make unfinished work disappear. A short-term plan
change does not redefine long-term ability.

Failure case: the Agent behaves like a course Tutor that cannot see real work,
or like a todo list that cannot see learning.

## Capability 8: continue across Sessions and recover detail

The learner can return after several days and say "continue." The Tutor can
choose a sensible next move from current facts and retrieve earlier detail only
when required.

Required behavior:

- preserve raw Sessions and relevant tool results locally;
- resume from current course position and live constraints;
- surface due revisits without a manual reminder;
- find the original explanation, material, attempt, or decision when detail is
  needed; and
- avoid loading the entire history before every response.

Failure case: Session search exists, but the learner remains responsible for
deciding what to search and rebuilding the learning situation.

## Capability 9: keep learning facts correctable

Routine progress and local scheduling changes should not interrupt the learner
with constant approval prompts. They remain visible and correctable.

Required behavior:

- distinguish learner reports, observed results, fallible interpretations, and
  resulting actions when the distinction matters;
- preserve original history while correcting later summaries or derived facts;
- let the learner override an immediate plan without forcing a false ability
  claim; and
- request attention when uncertainty leads to materially different actions or
  an external effect is difficult to reverse.

Failure case: the model's compressed memory becomes an uneditable source of
truth, or routine use is blocked by approvals that users stop reading.

## Capability 10: use generic tools inside the learning process

Search, code execution, PDFs, notes, Anki, and external applications are
generic facilities. They become part of the learning product when the Tutor
selects and uses them according to the current learning action.

Examples:

- run code to demonstrate or investigate a concept;
- retrieve a bounded material passage for the current explanation;
- create a card when active recall is a suitable future action;
- update a note as a human-readable artifact; and
- open a viewer when a richer surface helps.

Tool use does not become learning evidence merely because it occurred. External
writes continue to follow permission and reconciliation rules.

Failure case: the Agent exposes many tools, but none participate in course
continuation, teaching choice, review, or planning unless manually orchestrated
by the learner.

## Cross-capability requirements

- Detail is loaded lazily; the Tutor still retains a broad view.
- The learner can steer at any time.
- Teaching remains a full product action.
- Review timing and form remain purpose-sensitive; no card or interval
  algorithm is the universal continuation of learning.
- Simple progress stays simple.
- Actual performance is recorded only with the conditions needed by a future
  action.
- Time can change priority without creating false evidence.
- Raw history remains available for correction and detail recovery.
- A generic mechanism is preferred whenever it satisfies the learning contract.

## Coverage by the current behavior traces

| Behavior trace | Main capabilities exercised |
|---|---|
| Begin a course and teach | 1, 2, 3, 4, 5 |
| Operation before principle | 3, 4, 5 |
| Self-study a material range | 2, 4, 5, 8 |
| Practice exposes a local gap | 3, 5, 6, 9 |
| Deadline changes the plan | 2, 3, 7, 9 |
| Resume several days later | 2, 6, 7, 8 |

The traces are still review drafts. This table checks intended coverage; it
does not promote their illustrative details into a schema.

## What this contract does not choose

- database tables or TypeScript types;
- a topic graph representation;
- a mastery or confidence model;
- an FSRS integration;
- a scheduler score;
- a TUI framework;
- one model provider or model-routing policy;
- multi-agent orchestration; or
- the exact boundary between prompts, tools, queries, and deterministic code.

Those decisions follow demonstrated consumers and failure boundaries.

## Historical capability gate

This gate was used to check a bounded integration layer. Executing all six
scene-specific traces is not sufficient to represent the current product or
its default policy; the traces are mechanism regressions, not a product lower
bound. The original gate required all six traces plus the cross-capability
requirements below.

It may cover one course and bounded materials. It must still use real code to:

- persist the learning-owned facts produced by earlier interactions;
- assemble later context from those facts;
- compute time-dependent due items;
- accept learner steering;
- retrieve raw source detail; and
- apply corrections.

The implementation must not hand-fill the learning-native condition with the
expected next action, hidden learner truth, or an oracle summary. Otherwise the
comparison would only prove that a model benefits from being given the answer.

## Historical relationship to the comparison experiment

The comparison described below was not run and is no longer the automatic next
phase. It is retained to explain the original capability-gate reasoning.

The general Agent, the general Agent with a learning skill, and the
learning-native implementation are evaluated against the same capability
contract.

In the comparison, the skilled generic condition and the learning-native
condition use the same frozen Tutor skill. The learning-native condition adds
only executable learning semantics and context, so teaching-policy differences
cannot explain its result.

The contract describes the product target. The experiment asks which
capabilities a generic Agent or skill already supplies, which require persistent
learning semantics, and which remain unsupported by all three conditions.

If a mature generic mechanism or skill satisfies a capability completely, the
project should reuse it. If the learning-native implementation cannot satisfy a
capability with actual state transitions and source history, it is not ready to
represent that condition in the experiment.
