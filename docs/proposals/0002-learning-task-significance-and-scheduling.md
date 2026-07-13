# Learning-task significance and scheduling behavior

Date: 2026-07-10

Status: Historical working model. It preserves useful boundaries for formal
assessment and review, but its task-promotion vocabulary and verification
obligations are not the current general design. It does not authorize a
production schema, scheduler algorithm, or curriculum ontology.

Post-benchmark note (2026-07-11): ALS-015 did not demonstrate inferred-state
advantage over a stateless selector, and ALS-016 did not validate a replacement
evidence schema. The behavioral principles remain useful; candidate ranking and
general evidence representation remain explicitly unvalidated.

Maintainer clarification (2026-07-11): teaching, demonstration, self-study,
practice, and review are peer actions. An explanation may leave only a modest
"explained" progress fact and a source reference. It does not need a
verification obligation. The current responsibility hypothesis is
[`0003-learning-native-responsibilities.md`](./0003-learning-native-responsibilities.md).

## Decision question

When may an item in Session history affect review or future task selection, and
what local consequences may it produce without rewriting the curricular
structure?

## Historical task-centered path

```text
accepted goal and available curricular context
                    +
candidate learning tasks and their educational purpose
                    +
source-linked results from formal learning tasks
                    +
time-derived review pressure
                    |
                    v
              select next task
```

The path is intentionally narrower than "every educational conversation changes
learner state." Teaching remains a core Tutor behavior. The model supplies much
of the flexible explanation, while the Learning Domain can affect what is
taught, which context and sources are used, how the Tutor continues, and what
should be revisited later. It only needs durable information that improves such
future behavior.

## Semantic roles, not production types

### Curricular structure

An optional, source-grounded, versioned, partial representation of domain or
course relationships. It may be extended lazily. It is not the learner's
current plan or a unique next-step route. Learner performance can change the
learner overlay, plan, and task selection, but cannot silently edit accepted
curricular relations.

### Task purpose and alignment

The educational reason a task exists and the knowledge it teaches, assesses,
requires, or substantially exercises. Without this context, a correct or
incorrect response has no stable scheduling meaning.

### Source-linked task result

The observable outcome and conditions of an interaction admitted as
learning-significant, whether its educational purpose was known beforehand or
recognized from source context afterward. It references the authoritative
Session item, tool result, or artifact version; the learning layer does not copy
the original response.

### Learner overlay

A rebuildable interpretation of task history and retention risk for the active
goal. It is not the curricular structure and is not a declaration of the
learner's inner state.

### Scheduling decision

A reversible choice that makes a task eligible, due, deferred, or preferred for
stated reasons. Crossing a due time does not create learning evidence.

## Promotion boundary

Session history remains Session history unless all applicable conditions hold:

1. The interaction has an identifiable educational purpose; it may have been
   selected beforehand or recognized from source context afterward.
2. The task's purpose and target are known well enough to interpret the result.
3. Relevant conditions such as assistance, hints, timing, or grading are known
   when they affect meaning.
4. The result can legitimately alter review pressure, local task priority, or a
   future verification obligation.

Promotion stores the educational meaning and source reference, not a second
copy of the original text or artifact.

An explanation selected as a learning task can create a future verification
obligation. It does not by itself provide evidence of mastery. An ordinary
question or clarification creates neither unless the learner explicitly asks to
track it.

## Behavior by task context

| Context | Immediate behavior | Permitted durable consequence |
|---|---|---|
| Ordinary question or clarification | Answer normally | None by default |
| Selected explanation or exposure | Teach using an appropriate strategy | Optional future verification obligation; no mastery inference |
| Lesson or practice attempt | Apply task-local feedback and practice policy | Source-linked result may affect local priority |
| Diagnostic | Continue the diagnostic and combine noisy observations | Update a rebuildable learner overlay; no automatic route edit |
| Quiz or checkpoint | Preserve the assessment boundary | After completion, create targeted review candidates for relevant misses |
| Scheduled review | Grade under recorded conditions | Update the topic's retention projection and later review pressure |
| Passage of time | Recompute current risk and due candidates | No new evidence record |

The table does not require separate agent runtimes. These are policy
contributions over one loop as required by ADR-0002.

## Candidate generation and selection

The selector may draw from:

```text
ready new work
union naturally due review
union assessment-triggered review
union repeated-failure remediation
union current real-world obligations
```

These are reasons, not necessarily disjoint task kinds. One task may satisfy
several reasons, and the reasons must remain inspectable after duplicate
candidates are merged.

The first selector need not reproduce Math Academy's proprietary policy. It
must preserve these invariants:

- a learner error does not modify source-grounded curricular relations, though
  it may change the current plan;
- one weak observation cannot silently become a global mastery claim;
- time-derived urgency is not learning evidence;
- a task receives implicit review credit only when its alignment says the
  target was actually exercised;
- local review and remediation do not require a "return to mainline" state;
- short-term goals may change priority without redefining long-term capability.

## Behavioral oracles

### Casual clarification

```text
learner asks what a term means
-> Tutor answers
-> Session transcript changes
-> no learner overlay, review obligation, or curricular route changes
```

### Quiz miss

```text
formal quiz records a source-linked incorrect attempt
-> quiz policy completes the assessment boundary
-> targeted review candidate becomes eligible
-> curricular relations remain unchanged while the task plan may adapt
```

### Ordinary forgetting

```text
no new learner activity occurs
-> time passes
-> a prior target becomes due under the retention model
-> selector can choose a review
-> no new evidence was invented
```

### Implicit review

```text
an advanced task successfully and substantially exercises a due component skill
-> the result cites both task alignment and source attempt
-> explicit review pressure for the component may decrease
-> prerequisite status alone is insufficient
```

### Assisted performance

```text
a task is completed with hints, AI, or another person
-> the real conditions remain attached to the source-linked result
-> the result may support exposure or guided performance
-> it is not silently treated as independent recall
```

### Structure stability and plan adaptation

```text
one learner repeatedly struggles with a target
-> learner overlay and candidate priorities may change
-> current task plan may change
-> accepted curriculum relations remain unchanged
-> a curriculum correction follows a separate source/review path
```

## Relationship to the semantic-anchor lab

The revised lab now exercises casual clarification, selected explanation,
formal success and miss results, assistance conditions, correction,
time-derived review, an atomic local settlement, projection rebuild, and a
changed next action. This is executable support for the boundary in this
proposal.

Its local signals, candidate priorities, and deterministic selector remain
lab-local wiring oracles. They do not establish a production learner model,
retention rule, or scheduler policy.

The revised
[foundation runtime proposal](./0001-foundation-runtime-contracts.md) uses this
boundary for its first vertical contract slice. Runtime lifecycle choices in
that document do not make the scheduling policy here accepted automatically.

## Open design questions

1. What evidence of educational purpose is sufficient to promote an existing
   Session or artifact reference, including work recognized after it occurred?
2. How is task-to-target alignment admitted when it comes from an LLM rather
   than a reviewed domain source?
3. Which retention model is sufficient for the first supported domain, and
   which parameters remain rebuildable rather than authoritative?
4. How should several candidate reasons be ranked under an exam deadline and a
   limited time budget?

These questions precede production tables and FSRS integration. A scheduler is
only as meaningful as the boundary that determines which observations it may
consume.
