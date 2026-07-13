# Validation without a large user base, and storage without Markdown-as-database

Date: 2026-07-10

Status: Research synthesis and engineering recommendation. The persistence
details remain subject to a focused lab before becoming an ADR.

Current scope note (2026-07-11): SQLite authority, source provenance, and
early behavioral validation remain useful. Detailed evidence and projection
storage in this document is a pre-benchmark design hypothesis, not the current
learning-state plan.

## Questions

Agentic Learning System has no large initial user base, and proving that it
improves an entire semester of learning would take months. What can be validated
earlier without pretending that a short demo proves educational effectiveness?

The system also needs durable learner and course state. Should model-maintained
Markdown be authoritative, or should human-readable text remain separate from
machine state?

Finally, how can the project study generic harness contracts without allowing
generic agent infrastructure to become the architecture's center?

## Findings

1. There is no single short experiment that proves the product's complete
   educational value. Early work should use an evidence ladder that falsifies
   increasingly strong failure modes.
2. Public longitudinal tutor datasets can test whether history-derived state
   predicts later performance. They cannot by themselves prove that Repa's
   chosen teaching action caused better learning.
3. Short, repeated within-learner studies can evaluate bounded interventions
   and delayed retention before a full-course study is possible.
4. Markdown is appropriate for source material, learner-authored notes, and
   generated views. It is a poor authority for transactional, queryable,
   versioned learning state.
5. SQLite should initially hold both current structured state and the audit
   records needed to explain or correct it. Full event sourcing is not required.
6. Agent-runtime contracts and a thin learning-semantic path must be designed
   together. A generic harness completed in isolation would contradict the
   product thesis.

## Do not demand one grand first-stage proof

"Prove that the product works" bundles several claims:

```text
the software preserves a coherent history
the model reconstructs the relevant state
the state predicts something about later learner behavior
the state changes the selected action
the selected action causes better learning
the complete product remains useful over months
```

The final claims require longitudinal use and, for causal confidence, a
comparison condition. Lack of early users makes them unavailable at first, but
it does not make all validation impossible.

The right early objective is not proof by demo. It is to make the system
progressively harder to fool, including by its own plausible explanations.

## A validation ladder

### Level 0: software and recovery validity

Question: Does the system preserve what actually happened?

Checks include:

- model and tool sequences satisfy their legal lifecycle;
- accepted learning records survive restart;
- partial transactions do not produce half-applied learning state;
- correction does not silently erase the prior record;
- a rebuilt projection is equivalent to the committed projection;
- different model summaries cannot mutate historical evidence.

This proves infrastructure only, but every stronger result depends on it.

### Level 1: state reconstruction validity

Question: Given a hidden history, does the stateful Tutor recover relevant
facts and distinguish observed, reported, inferred, and unknown information?

A scenario corpus can be assembled from hand-audited traces without simulating
an entire learner. Each trace hides selected earlier events and tests whether
the assembled context supports correct reconstruction.

Useful comparisons:

```text
current user message only
full raw transcript
structured evidence plus compact projection
```

The purpose is to test whether the chosen state representation adds value over
ordinary chat memory.

### Level 2: predictive validity

Question: Does accumulated state improve prediction of the next observable
performance?

Examples:

- probability of an independent answer being correct;
- error category likely to recur;
- whether a delayed recall will fail;
- time or help likely to be required;
- whether a proposed prerequisite repair predicts later success.

This makes learner-state claims falsifiable. A system that says a topic is weak
but cannot predict any relevant future observation may only be generating a
convincing narrative.

Large public datasets make this test possible before Repa has many users.
Carnegie Mellon's DataShop currently reports more than 250 million fine-grained
student actions, 358,000 students, and 1,466 datasets from tutors, courses,
simulators, and educational games. Many datasets include action-response
transactions, knowledge-component mappings, and pre/post assessments.

These datasets do not reproduce the open local-agent product. They can still
test isolated state and prediction mechanisms and provide realistic replay
traces.

Sources:

- Carnegie Mellon DataLab,
  [About DataShop](https://www.cmu.edu/datalab/tools/datashop.html)
- Galyardt and Goldin,
  [Predicting Performance During Tutoring with Models of Recent Performance](https://arxiv.org/abs/1501.02732)

### Level 3: action sensitivity and decision consistency

Question: Does materially different evidence produce materially different next
actions for defensible reasons?

This can be tested with paired traces:

```text
same goal and course
+ evidence of stable delayed performance
versus
+ repeated independent failure on an exercised prerequisite
```

The Tutor should not emit the same generic plan. Conversely, irrelevant history
should not cause arbitrary divergence.

This tests policy coherence, not learning effect. LLM judges may help locate
disagreements but cannot be the sole authority. Deterministic invariants,
source-backed expectations, and blind human review of a small high-value set are
stronger.

### Level 4: bounded learning effect

Question: Does one specific tutoring choice improve immediate or delayed
performance on a bounded target?

This need not require completing a course. Possible designs include:

- alternate comparable microtopics between a stateful Tutor condition and a
  deliberately weaker baseline;
- use repeated measures with short delayed tests;
- compare two hint or remediation policies within the same learner;
- run a small single-case design in which the learner serves as their own
  repeated control.

The intervention and outcome must be narrow enough to interpret. "Used Repa for
a week" is not an intervention definition.

Single-case research is an established educational method, but it still
requires repeated measurement and careful control. It should not be used as a
rhetorical substitute for replication.

Sources:

- Institute of Education Sciences,
  [Single-Case Design Research](https://ies.ed.gov/ncee/WWC/Docs/referenceresources/SCD-Webinar-Slides.pdf)
- Riley-Tillman et al.,
  [Evaluating Educational Interventions: Single-Case Design](https://www.guilford.com/books/Evaluating-Educational-Interventions/Riley-Tillman-Burns-Kilgus/9781462542130)

### Level 5: longitudinal product effect

Question: Does the complete system improve robust learning, goal attainment,
and sustainable use over a real course or long project?

This is the eventual dogfood, pilot, or controlled study. It cannot honestly be
pulled forward by synthetic learners or LLM-based evaluation.

Simulated learners remain useful for load, control-flow, and regression tests.
They are not evidence that humans learn better.

## What the first stage can legitimately establish

The first stage does not need a social user base if it claims only:

```text
1. learning history survives and remains correctable;
2. a stateful context reconstructs relevant learner state better than a
   stateless prompt or raw transcript;
3. inferred state predicts selected later observations above simple baselines;
4. the Tutor's next action changes coherently when learning evidence changes.
```

These are necessary conditions for the product thesis, not sufficient proof of
educational effectiveness.

This replaces one oversized MVP claim with a sequence of falsifiable gates.

## Why Markdown should not be authoritative state

Markdown is good at representing authored narrative. It is intentionally weak
at representing transactional application state.

Using Markdown as the source of truth would require the project to invent:

- stable identity independent of headings and file names;
- schema validation and referential integrity;
- atomic updates across evidence, claims, reviews, and obligations;
- concurrency and crash behavior;
- query indexes;
- migrations when the meaning of a field changes;
- protection against an LLM accidentally deleting or paraphrasing a fact;
- a distinction between human prose and machine-owned fields.

Frontmatter adds fields but does not supply these database properties. A set of
Markdown conventions would gradually become an undocumented database engine.

Markdown remains appropriate for:

```text
course and learner-authored notes
material annotations
human instructions such as LEARNING.md
session reports and exports
generated audit views
portable snapshots intended for reading
```

It should not be the sole authority for:

```text
learning observations and evidence
current goals and obligations
review schedules
model-inference provenance
corrections and retractions
session/tool lifecycle
```

## Recommended storage shape

Use one local SQLite database as the initial machine-state authority.

SQLite supplies atomic, consistent, isolated, and durable transactions even
across application or operating-system failure. A single local writer also fits
the proposed per-session serialized runtime.

Sources:

- SQLite, [SQLite Is Transactional](https://www.sqlite.org/transactional.html)
- SQLite, [Transaction](https://www.sqlite.org/lang_transaction.html)

The database should be conceptually divided into three types of record, without
requiring three databases or a general event-sourcing framework.

### Durable occurrences

Records of what happened or was reported. They are append-mostly and retain
provenance. Corrections point to prior records rather than rewriting them
invisibly.

### Current structured state

Goals, active course mappings, obligations, review due dates, and other state
that must be queried directly. Updates to current state and their audit records
can commit in the same SQLite transaction.

### Rebuildable projections

Model-produced learner summaries, compressed context, explanations of current
weaknesses, and human-readable reports. These carry the source record IDs,
model/prompt version, and build time used to create them. They may be discarded
and regenerated.

A projection may contain Markdown text for rendering. That does not make a
`.md` file authoritative.

## Do not adopt full event sourcing by reflex

The need for provenance does not require making every domain object a replayed
event stream.

Full event sourcing introduces event-version evolution, projection machinery,
replay compatibility, and eventual-consistency concerns. Microsoft's current
architecture guidance explicitly recommends adopting it only when its
auditability and reconstruction benefits justify those costs.

For Repa, the initial compromise is:

```text
SQLite current tables
+ append-mostly observation/audit tables
+ transactional updates
+ rebuildable model projections
```

This preserves correction and explanation without committing the whole product
to an event-sourced architecture.

Source:

- Microsoft Azure Architecture Center,
  [Event Sourcing pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing)

## Avoid dual authoritative writes

Do not synchronously treat both `events.jsonl` and SQLite as sources of truth.
That creates an immediate question about partial writes and reconciliation.

If JSONL is useful for debugging or export, generate it from committed SQLite
records. If human-readable Markdown is useful for inspection, generate it from
the same source. Neither becomes a second authority.

## Structured learning events are not an unusual invention

Learning systems already use structured activity-event vocabularies. 1EdTech
Caliper defines JSON-LD learning and usage events, while ISO guidance discusses
interoperability between Caliper and xAPI. Repa should not import either large
standard prematurely, but their existence supports the distinction between
machine-owned learning events and human-authored notes.

Sources:

- 1EdTech, [Caliper Analytics Specification](https://www.imsglobal.org/spec/caliper/v1p2/)
- ISO/IEC,
  [Learning analytics interoperability guidelines](https://www.iso.org/standard/74449.html)

## What first-class learning means architecturally

It does not mean that provider adapters, streaming decoders, or terminal widgets
contain `Topic` and `Review` branches.

It means the first end-to-end runtime contracts are exercised by a learning
loop, not only by generic echo, file-write, or weather tools:

```text
committed learning occurrence
-> rebuildable learner projection
-> context assembly
-> Tutor action
-> new observation
-> changed future action
```

The generic loop remains domain-independent at its lower levels, while learning
is first-class in:

- the default context sources;
- durable domain transactions;
- the normal continuation policy after teaching or assessment;
- the action and tool vocabulary exposed to the Tutor;
- session summaries and resumption;
- validation fixtures and product success gates.

This requires a thin learning-semantic fixture during the foundation phase. It
does not require a complete learner ontology or production curriculum model.

## Consequences

1. Do not select a full-course completion as the sole first validation target.
2. Record enough conditions and provenance for later performance prediction.
3. Compare stateful context against stateless and raw-transcript baselines.
4. Treat causal task-selection evaluation as a later and harder stage than
   state prediction.
5. Use SQLite, not Markdown, as the initial machine-state authority.
6. Store model summaries as versioned, rebuildable projections.
7. Prefer transactional current state plus audit records over wholesale event
   sourcing.
8. Develop generic runtime contracts against a thin learning loop so the
   foundation cannot silently become a generic agent product.

## Still unresolved

- The smallest event vocabulary that preserves useful evidence conditions
  without encoding a premature learning ontology.
- Which public DataShop datasets are close enough to the first target domain to
  support meaningful replay experiments.
- How to score next-action coherence without substituting an LLM judge for
  educational evidence.
- The exact boundary between Session transactions and Learning-domain
  transactions during interruption or crash.
- Backup, export, and user inspection of the SQLite authority without making
  generated views independently editable state.
