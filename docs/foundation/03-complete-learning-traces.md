# Complete learning behavior traces

Date: 2026-07-11

Status: Review draft of the product behavior baseline. The cross-trace checks
restate accepted maintainer intent; scenario details remain illustrative until
reviewed. These traces do not prescribe a workflow engine, database schema,
prompt, or teaching algorithm.

## How to read the traces

Each trace follows one learning situation across time. It records:

- what the system already knows;
- what the Tutor does;
- a candidate smallest useful durable change;
- what should appear later without the learner restating it; and
- what can remain only in the raw Session or material.

The headings are an inspection aid. They are not production types. The Tutor
may combine actions, and the learner may interrupt, skip, request a different
explanation, or ask to be tested at any time.

## Trace 1: begin a course and teach

### Situation

A learner starts a course with a goal, an available body of material, and a
limited amount of time. The learner wants to begin rather than spend the first
session configuring a complete curriculum model.

### Already available

- the learning goal and any deadline;
- the selected course or material;
- a broad route or table of contents; and
- the current time budget.

### Tutor behavior

The Tutor gives enough orientation for the current section to make sense, then
teaches a useful piece of it. It may explain, demonstrate an example, compare
representations, or answer questions. It does not attach a quiz merely because
an explanation occurred.

The learner can ask for less detail, a different example, direct practice, or
more background. The Tutor changes the current action without restarting the
course or changing runtime.

If the learner says the explanation did not help, the Tutor changes something
material when possible: representation, example, ordering, amount of
background, relation to a procedure, or the learner's role in the interaction.
It does not merely repeat polished wording or require a diagnostic label before
trying another approach.

### Candidate minimal record

- the course has begun;
- the relevant section was explained.

The raw Session already preserves what happened. A separate source pointer is
added only when later behavior needs a faster or more stable path back to the
exact material or interaction.

### Later automatic behavior

The next session can continue from the next useful part of the route. If the
previous example or explanation becomes relevant, the Tutor can retrieve the
source material or raw Session.

### Raw history only

The exact wording, temporary analogies, ordinary questions, and abandoned
explanations stay in the Session unless a later use justifies a smaller derived
fact.

## Trace 2: learn an operation before its principle

### Situation

A topic is easier to understand after the learner has first used a procedure or
seen several concrete cases. Beginning with the complete underlying theory
would add load without helping the immediate learning move.

### Already available

- the operation belongs to the current course route;
- the learner has not yet used it; and
- a later conceptual explanation will be useful.

### Tutor behavior

The Tutor demonstrates the operation and lets the learner follow or repeat it.
Once the learner has enough familiarity, the Tutor can explain why it works.
That explanation may happen in the same Session or when the route naturally
returns to the principle.

If the learner says "show me why now" or "let me practise first," the Tutor
follows that steering unless a real constraint makes it unsuitable.

### Candidate minimal record

- the operation was demonstrated if the learner only watched it;
- the learner followed the operation if they actually performed it;
- the principle was explained only if that actually occurred; and
- a source pointer is added only when a later use needs it.

The system does not invent a mastery level from successful imitation.

### Later automatic behavior

When the operation is used again, the Tutor can choose an independent attempt,
a concise reminder, or the postponed principle. It does not repeatedly teach
the introductory procedure as if nothing happened.

### Raw history only

One-off environment errors, each individual hint, intermediate commands, and
the complete exploratory dialogue remain in the Session.

## Trace 3: self-study a material range

### Situation

The learner plans to read or watch a defined range independently and asks the
Tutor to remain available for questions.

### Already available

- the course and material identity;
- the intended range; and
- the relation of that range to the broad route.

### Tutor behavior

The Tutor lets the learner study. It answers questions when asked and may help
with an example. It does not force a summary, split the material into a large
knowledge schema, or require a test at the end.

### Candidate minimal record

- the learner reports that the material range was read or watched;
- Tutor-led portions, if any, may separately be marked explained.

The report is useful progress information. It is not independent proof of
retention or application. The raw Session already records the report; no
separate detailed provenance object is required by default.

### Later automatic behavior

The Tutor avoids an unnecessary first introduction to the same range. Later
practice, application, a question, or a scheduled revisit can retrieve the
material and the earlier Session when details matter.

### Raw history only

Passing reactions, minor questions, the full material text, and the Tutor's
complete answers remain at their original sources.

## Trace 4: practice exposes a local gap and creates a revisit

### Situation

Practice is useful at this point in the course. A learner attempts a task and
makes an error that plausibly points to a local prerequisite or procedure.

### Already available

- why the task is being used;
- the relevant course and material context; and
- whether the attempt was independent or assisted when that changes its
  meaning.

### Tutor behavior

The Tutor responds to the task, then investigates only as far as needed to help
the current learning. It may explain the missing idea, demonstrate the
procedure, or give another attempt. A temporary error attribution remains a
hypothesis unless later behavior supports it.

One error may alter local review or the next few actions. It does not rewrite
the long-term course route.

### Candidate minimal record

- the actual task result and relevant assistance conditions;
- a source reference to the attempt;
- a local gap or revisit only when it can improve later action; and
- any scheduled review that was actually created.

### Later automatic behavior

At an appropriate later time, the revisit becomes a candidate action. A later
course task that genuinely uses the same material may also supply the revisit;
the system need not insist on a separate ritual.

The return is shaped by its purpose. A retrieval problem may call for recall
and feedback; a strategy-confusion problem may call for contrasting cases; an
integration problem may call for explanation, representation change, or
application. Time alone can make the revisit eligible, but it does not choose
one universal review form or prove that the learner forgot.

Beginning the return does not settle the future concern. A later activity
serves it only when the target and original reason align. Serving that reason
still does not mean the learner succeeded: an independent attempt can complete
the promised check while its incorrect result separately supports more
feedback or another revisit. Cancelling the concern is likewise different from
serving it and from producing learning evidence.

### Raw history only

The full solution, every hint, detailed scratch work, and tentative error
stories remain in the Session or task artifact unless a future decision needs
them.

## Trace 5: substantial real work changes the multi-day plan

### Situation

A real assignment requires several hours or days of work and is due later while
teaching, review, and other obligations are also pending. The normal product
case is early enough to distribute the work across available days. Work that
has already collapsed to a minute-scale deadline window is outside Repa's
product scope; no rescue behavior is derived here.

### Already available

- the assignment identity, subject or learning context, and source/nature;
- the deadline, estimated remaining work, and completion state;
- known available capacity over the relevant days;
- current course progress and due review; and
- the assignment's known relation to learning goals.

### Tutor behavior

The Learning System checks whether the remaining work fits the remaining
capacity, allocates a reasonable amount before the deadline, and revises that
allocation when progress, availability, estimates, or the deadline changes.
The Tutor may compress a low-learning-value deliverable, teach the material
needed for valuable work, or postpone less urgent new material and review. The
LLM may help interpret or decompose the work and explain alternatives, but it
is not responsible for remembering the quantities or performing the basic
cross-day arithmetic. The learner remains able to correct inputs and override
the proposed trade-off.

The temporary decision does not become a claim about the learner's long-term
ability or preferred way of learning.

### Candidate minimal record

- the assignment's durable identity and learning context;
- the deadline, estimated remaining work, relevant capacity, and current
  disposition, with source and uncertainty where needed;
- the current allocation or commitment that must survive the Session; and
- enough completion feedback to recompute the remaining plan.

### Later automatic behavior

The task continues to affect planning until it is completed, cancelled, or
otherwise resolved. Each relevant planning cycle can compare work left with
capacity left; no Session transcript has to reconstruct those quantities.
Passing the deadline can turn it into overdue work, a late-submission decision,
or a recorded loss; it does not make the task vanish. Deferred learning and
review return to consideration when the real constraint allows it, without
requiring the learner to remember and restate each one.

### Raw history only

The full trade-off discussion, discarded decompositions, and abandoned plans
stay in the Session. Estimates or allocations that affect later planning are
durable, source-aware, and correctable rather than cold prose.

## Trace 6: resume several days later

### Situation

The learner opens a new Session after several days and says only "continue".

### Already available

- active goals and courses;
- broad course route and current material position;
- read or explained ranges;
- task and review results that still affect action;
- due revisits, assignments, and deadlines; and
- local references to earlier Sessions and materials.

### Tutor behavior

The Tutor assembles a small current view and proposes or begins a reasonable
next action. It may continue teaching, surface a due review, resume an
assignment, or ask one question when several materially different choices
remain.

It retrieves a full earlier explanation, task, or material only when the
current action needs that detail. It does not construct a complete learner
portrait before responding.

### Candidate minimal record

Only facts newly created in this Session are added: new progress, a real task
result, a changed deadline, a commitment, or a scheduled revisit.

### Later automatic behavior

The same process repeats from the updated current view. The learner does not
serve as the application's manual synchronization mechanism.

### Raw history only

Old explanation text, complete transcripts, and ordinary exchanges that do not
affect future action remain searchable at their original source.

## Cross-trace checks

A later design conflicts with this baseline when it:

- makes practice the required end of teaching;
- treats read, watched, demonstrated, or explained as mastery;
- requires every Session exchange to create structured learning evidence;
- loses course progress unless the learner restates it;
- loads all prior Sessions and materials before every response;
- changes a stable course route after one local error; or
- lets a generic chat summary become the sole source of a learning fact;
- repeats the same explanation after the learner reports that it failed,
  without considering another useful move;
- applies one review form or interval algorithm to every learning purpose; or
- treats dismissing a revisit, serving its purpose, and producing evidence of
  learning as one `completed` meaning; or
- obstructs an explicit real-work request with mandatory teaching ritual while
  hiding the resulting trade-off.
