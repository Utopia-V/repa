# Learning-native capability and comparison phase

Date: 2026-07-11

Status: Superseded on 2026-07-11. B1 and B2 remain useful mechanism and
integration evidence. Later maintainer clarification, the decision to shelve a
broad three-condition comparison as the automatic next phase, and ALS-017's
model-write result changed the active boundary. This file preserves the
historical protocol; use `../current-understanding.md` and the experiment ledger
for current navigation.

## Goal

First establish what a learning Agent must be able to do. Then implement enough
of those capabilities to create a real learning-native experimental condition.
Only then compare it with a capable general Agent and a general Agent supplied
with a strong learning skill.

This phase follows:

- [`../current-understanding.md`](../current-understanding.md);
- [`../foundation/03-complete-learning-traces.md`](../foundation/03-complete-learning-traces.md);
- [`../proposals/0003-learning-native-responsibilities.md`](../proposals/0003-learning-native-responsibilities.md); and
- [`../proposals/0004-learning-native-capability-contract.md`](../proposals/0004-learning-native-capability-contract.md).

## Why the comparison cannot run yet

The learning-native Agent does not exist. Manually supplying an ideal course
summary, correct learner state, due review, and expected next action would make
the experiment circular. It would show that a model performs better when given
the answer.

A scripted or model-simulated learner is acceptable when it follows a frozen
responsive policy. It receives the Tutor's observable action and produces the
corresponding question, answer, attempt, interruption, or completion report.
It cannot read the experimental condition or supply hidden state. The Agent's
learning state, context, schedules, and later actions must still be produced by
executable mechanisms from earlier interactions.

## Phase A: review the capability contract

The review draft defines ten capabilities:

1. establish a course and broad route;
2. assemble learning context automatically;
3. choose among Tutor actions;
4. teach with materials and adapt locally;
5. retain simple progress without inflating it;
6. use real performance for feedback, revisits, and review;
7. include assignments, deadlines, and time;
8. continue across Sessions and recover detail;
9. keep learning facts correctable; and
10. use generic tools inside the learning process.

Review checks:

- each capability is required by at least one complete behavior trace;
- generic facilities are assumed rather than reimplemented;
- teaching remains a full action;
- simple progress does not become an ability claim; and
- no capability quietly requires a full topic graph, learner model, or
  scheduler.

Phase A ends when the maintainer accepts, removes, or revises the capability
set. Scenario details remain reviewable and do not become data types.

## Phase B: build an executable experimental condition

The experiment uses one shared headless Agent loop. All conditions use the same:

- model and provider configuration;
- generic file, search, code, and material tools;
- raw Session store and search;
- course materials; and
- controllable clock, external events, and responsive learner policy.

The learning-native condition additionally implements real code for the bounded
course used by the experiment:

- durable active goal and course;
- a broad route and current material position;
- simple read, explained, demonstrated, and followed progress;
- specific pending revisits and due-time computation;
- assignments, deadlines, and resolution state;
- automatic learning-context assembly;
- learning tools that update those facts from actual prior interactions; and
- correction with access to raw source history.

The implementation may live under `labs/` and remain intentionally small. It is
still an executable learning layer, not a prompt fixture. It must persist across
separate process runs or equivalent fresh Session reconstruction.

The lab does not need:

- a full TUI;
- arbitrary-course import;
- a complete topic graph;
- a mastery model;
- FSRS;
- Anki or Obsidian;
- multi-agent orchestration; or
- a production package layout.

### Phase B1: deterministic mechanism checks

Before using a live model, direct tool calls and recorded model events verify:

- persistence across a fresh process or Session reconstruction;
- legal progress, revisit, assignment, and correction transitions;
- due-time computation under the controllable clock;
- context assembly from previously committed facts; and
- rejection of hidden, forged, or stale state.

These checks establish mechanics only. They do not claim that the Tutor can
teach or choose a good action.

#### B1 result — 2026-07-11

The isolated file-backed lab passes the deterministic mechanism checks. It
persists the active course and compact progress, keeps attempts lazy, derives
due and overdue state from a monotonic virtual clock, supports explicit
correction/reopen transitions, and atomically settles runtime-owned learning
writes with their tool results. A recorded call without a settlement is not
auto-executed during recovery.

The implementation and its limits are recorded in
[`../research/learning-native-capability-b1-2026-07-11.md`](../research/learning-native-capability-b1-2026-07-11.md).
Phase B2 is now the active subphase. B1 does not establish Tutor quality or a
production architecture.

### Phase B2: bounded live behavior checks

After the deterministic mechanisms pass, limited model calls drive the six
behavior traces through the experimental learning layer. The responsive learner
policy branches on the Tutor's action, so it never answers an unasked question
or claims to follow an unseen demonstration.

This is integration work, not the formal three-condition comparison. It checks
that real model behavior can use the mechanisms without oracle context. Exact
prose is not frozen.

#### B2 progress — 2026-07-11

Trace 1, begin a course and teach, has passed the bounded integration check. A
real two-turn Tutor interaction read pinned material, adjusted after learner
steering, retained the full Session locally, and left exactly one source-linked
`explained` fact after a fresh reopen. Teaching quality was reviewed separately
from that progress fact. The run history and the one oracle correction are
recorded in
[`../research/learning-native-b2-trace-1-2026-07-11.md`](../research/learning-native-b2-trace-1-2026-07-11.md).

Trace 2, operation before principle, has also passed. The Tutor demonstrated a
visible operation before explaining its receiver principle, while the learning
layer retained `demonstrated`, `followed`, and `explained` as distinct simple
facts. Details are in
[`../research/learning-native-b2-trace-2-2026-07-11.md`](../research/learning-native-b2-trace-2-2026-07-11.md).

Trace 3, independent material study, has passed. The Tutor remained available
without taking over, and the learner's completion report produced only a
source-linked `read` fact. Details are in
[`../research/learning-native-b2-trace-3-2026-07-11.md`](../research/learning-native-b2-trace-3-2026-07-11.md).

Trace 4, practice and a local revisit, has passed. A source-linked wrong attempt
produced bounded feedback and one due revisit without changing the course
route. Details are in
[`../research/learning-native-b2-trace-4-2026-07-11.md`](../research/learning-native-b2-trace-4-2026-07-11.md).

Trace 5, deadline-sensitive near-term planning, has passed. The urgent
assignment changed the short plan without erasing due review or creating a
learner-level claim. Details are in
[`../research/learning-native-b2-trace-5-2026-07-11.md`](../research/learning-native-b2-trace-5-2026-07-11.md).

Trace 6, continuation after several days, has passed. A fresh Session containing
only `继续` used compact local state, retrieved one linked old attempt lazily,
and began the due revisit without settling it early. Details are in
[`../research/learning-native-b2-trace-6-2026-07-11.md`](../research/learning-native-b2-trace-6-2026-07-11.md).

Phase B2 is complete. The cross-trace synthesis is in
[`../research/learning-native-b2-six-trace-synthesis-2026-07-11.md`](../research/learning-native-b2-six-trace-synthesis-2026-07-11.md).
At that point the proposed next work was to freeze Phase C. That recommendation
was later superseded; the formal comparison did not start.

### Prohibited shortcuts

- Do not pre-populate a later Session with the expected next action.
- Do not insert hidden learner truth that no previous interaction produced.
- Do not hand-write the final course summary after seeing the expected result.
- Do not give the learning-native condition extra material or a better model.
- Do not make generic baselines artificially weak or deny them normal tool use.
- Do not treat a model-written summary as an authoritative state transition.

Phase B ends when deterministic mechanics pass and bounded live calls can drive
all six traces. The later context must be explainable from earlier committed
facts and external events.

## Phase C: freeze and run the comparison (shelved historical protocol)

The comparison runs three conditions:

1. **General Agent** — the shared model, tools, materials, raw Sessions, and
   compact general memory, with no special learning policy.
2. **General Agent with learning skill** — the same Agent with a strong reusable
   Tutor skill and the same Session retention/search facilities, but without
   learning-owned progress, scheduling, context assembly, or durable learning
   meaning.
3. **Learning-native Agent** — the same generic machinery and the exact same
   Tutor skill as condition 2, plus the executable learning layer built in
   Phase B.

The second condition is the primary baseline. It represents a serious attempt
to solve the product using a mature general Agent plus a learning skill.

## Shared multi-Session scenario

The frozen scenario contains:

- first teaching and a broad course orientation;
- an operation learned before its principle;
- independent material reading;
- learner steering that changes the current action;
- a practice result that creates a local revisit;
- passage of time that makes the revisit relevant;
- an assignment deadline that changes the near-term plan; and
- a new Session in which the learner says only "continue."

The conditions share the initial learner situation, materials, virtual clock,
external events, and responsive learner policy. Their transcripts may diverge
because their Tutors choose different actions. That divergence is part of the
result.

The learner policy is frozen before any run. It maps observable Tutor actions to
semantically valid responses and cannot branch on condition identity. The
scenario must preserve teaching as a normal action. An exercise-selection
benchmark cannot stand in for this comparison.

## Measures

The comparison records:

- whether the Tutor constructs and preserves a useful course-level view;
- whether the next action fits current course position and constraints;
- whether due review appears without a learner reminder;
- whether read or explained material is handled without claiming mastery;
- whether seeing a demonstration and personally following it lead to suitable
  differences when the distinction matters;
- whether due review and a live or overdue assignment alter the current action
  for learning-specific reasons;
- whether old detail is retrieved only when needed;
- whether teaching, demonstration, self-study, practice, review, gap repair, and
  assignment work remain available choices;
- how often the Tutor asks for facts already available locally; and
- which learning-owned facts, policies, or tools actually affect the response.

Exact prose quality is reviewed separately from these observable behaviors.

## Formal comparison gate

Do not start the formal three-condition comparison until:

- the capability contract has been reviewed;
- Phase B1 passes its deterministic mechanism checks;
- Phase B2 uses bounded live calls to pass the six traces without oracle state;
- all conditions use the same generic machinery, initial situation, materials,
  external events, clock, and responsive learner policy;
- the learning skill is a credible product alternative;
- conditions 2 and 3 use the same frozen Tutor skill and teaching policy, so
  their only intended difference is the executable learning layer;
- the learning-native condition receives no hidden answer;
- the correct behavior depends on history absent from the latest user message;
- each measure has a frozen scoring rule and counterexample; and
- different outcomes map to different design decisions.

## Outcome rules

### The learning-native condition beats the skilled generic Agent

Promote only the responsibilities and facts that changed useful behavior.
Derive the first production architecture from their owners and consumers.

### The learning skill improves the generic Agent and ties learning-native

The result supports shipping or reusing a learning skill before building a
dedicated layer. It does not establish first-class learning state.

### All three conditions tie

Do not declare specialization necessary. Remove unused mechanisms and inspect
whether the behavior cases express a real product difference.

### The learning-native condition harms behavior

Reject or narrow the harmful state, policy, or default while retaining useful
generic Agent capabilities.

### All three conditions fail

Do not infer an architecture. Revisit the capability contract, behavior cases,
Tutor policy, or model setup before adding more state.

## Limit of simulated learners

A simulated learner can provide controlled messages, answers, interruptions,
and passage through the scenario. The experiment can test Agent behavior,
continuity, persistence, context use, scheduling, source retrieval, and false
claims.

It cannot establish long-term retention, transfer, subject judgment, motivation,
or human teaching quality. Those claims eventually require real learners or
long-running personal use.

## Exit gate

This phase ends when:

- the capability contract is reviewed;
- the learning-native condition is executable rather than oracle-fed;
- the comparison has a frozen protocol and recorded result;
- every proposed durable fact names a demonstrated future consumer;
- unused representation is removed; and
- the first production architecture can be explained from demonstrated
  capabilities rather than experiment-specific scaffolding.
