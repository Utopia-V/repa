# Semantic drift audit after the Assignment correction

Date: 2026-07-13

Status: Accepted repository correction. This audit changes the interpretation
of Proposal 0006 and ALS-023, records independent current-runtime defects, and
re-establishes the next design boundary. It does not admit a replacement
Assignment schema or authorize new production planning code.

## Trigger and authority

The maintainer clarified that ordinary Assignment behavior is advance planning
for work that takes hours or days. A representative case is roughly five hours
of work due several days later, distributed before the deadline and recomputed
after progress or availability changes. Last-minute rescue after a task has
already collapsed to a minute-scale deadline window is outside Repa's product
scope, not a lower-priority or minority scenario.

The program owns durable quantities, trusted time, feasibility arithmetic,
cross-day allocation, correction, and recomputation. The learner or model may
propose estimates and semantic decompositions; the model may research, explain,
teach, and advise around ambiguity. Those open contributions do not make the
model the only scheduler or the durable source of truth.

This is accepted product intent. Exact fields, uncertainty representation,
allocation algorithm, and UI remain design questions.

## Root cause

The repository's own engineering method says that one emergency scenario must
not define the steady state of a long-running Tutor. B2 Trace 5 nevertheless
used a scene-specific prompt for a 45/25/30-minute conflict, and Proposal 0006
promoted that fixture into the next production pressure path.

The promotion inverted the parent question. The code became precise about a
deadline, provenance, replay, and a model-visible countdown while explicitly
deferring the data needed for normal advance planning: learning context,
workload, progress, capacity, allocations, and their revision. The later live
failure was then interpreted as a missing mechanism for forcing model
consideration. Because the representative input distribution was wrong, that
conclusion does not follow.

This is evidence-rank drift, not a minor prompt defect.

## What is withdrawn

- Proposal 0006 is withdrawn as a product contract and current pressure path.
  It remains a historical record of an engineering experiment selected from an
  invalid representative scenario.
- ALS-023 does not establish that the product needs a new near-deadline
  consideration mechanism. Its provider result is retained, but its product
  interpretation and proposed next research question are withdrawn.
- `tutor-default-v4` is not an incomplete production admission waiting for a
  stronger control mechanism. It is a dormant candidate whose aggregate shape
  is unaccepted.
- Deadline-first Assignment projection is not an earned semantic retrieval
  rule. Deadline alone cannot express workload pressure: a large task due later
  may require action before a tiny task due sooner.
- Model-owned one-Turn scheduling is not the default planning boundary.
- The previous decision to defer effort, capacity, progress, assignment
  learning context/nature, and durable allocation is withdrawn.

## What remains valid

- One local Tutor loop can combine mature generic Agent mechanics with
  Learning-System state; a second teaching runtime is unnecessary.
- Learning state survives Sessions independently of transcripts. Routine state
  should be bounded and detailed sources remain lazy.
- Course route, material revision, source provenance, correction, capability,
  transaction, and semantic replay boundaries remain useful.
- Model-initiated durable writes are valid when the program binds authority,
  identity, source, time, version, correction, and atomic settlement.
- An Assignment is a cross-Session, correctable real obligation. Its completion
  is not automatically Course progress, learner evidence, or mastery.
- Strict offset-aware time parsing is independently useful. Assignment
  provenance and transition patterns may be reused only after a replacement
  consumer justifies them; completed implementation is not such evidence.
- The Course representation remains logically graph-shaped: an ordered
  hierarchy plus sparse, typed, source-aware relations as consumers require.
  This rejects neither the maintainer's graph intuition nor relational storage.
- Learning ontology remains a required discipline of meaning: occurrence,
  report, evidence, inference, intention, and artifact must not collapse. It
  does not require one universal ontology schema or graph database.

## Current v3 defects found by the same audit

These defects are independent of dormant v4 and must not be hidden by the
Assignment correction.

### Unbounded default transcript

The default CLI reuses one `default` Session and sends all of its learner and
assistant items on every Turn. Durable cross-Session state works, but the
normal product path can still become dependent on an ever-growing transcript.
That contradicts bounded working-set composition and recreates the failure mode
the Learning System exists to remove.

### No learner-visible output boundary

The runtime streams and persists model text from all steps. Internal control
reasoning and IDs are kept out only by prompt instruction. This is not a sound
non-disclosure boundary and has already produced one live internal-ID leak.

### Multi-course state without a switching behavior

Storage can contain several courses, but after one course is active the Agent
has no production capability to list/select another existing course. The
LearnerHome model and the normal user behavior disagree.

### Retained steering cannot be withdrawn through the Agent

The domain has a withdrawal operation for retained timed learner steering, but
the production tool surface exposes only creation. A learner can override the
current Turn but cannot reliably correct the durable state through ordinary
interaction.

### Target architecture described as current behavior

Architecture prose refers to active focus, detour, and intended rejoin meanings
that production does not yet implement. They remain target ownership concepts,
not verified current behavior.

## Evidence that was over-weighted but is not discarded

B1/B2 remain mechanism exercises, not product sufficiency evidence. The six B2
traces used scene-specific policies and did not prove default action selection.
They retain evidence for compact/lazy context, cross-Session continuity,
correctable writes, and non-equivalence between exposure and mastery.

ALS-021 through ALS-022 and Proposal 0005 are narrower and better controlled.
They establish one implemented `learner response before Tutor disclosure`
behavior and reject the tested universal selectors. They do not establish a
general pedagogy constraint language or deserve to become the center of the
roadmap.

## Independent adversarial review

ChatGPT GPT-5.6 Pro with extended effort reviewed a minimal packet after the
local audits. It agreed that 0006 must be withdrawn as a product contract and
that the v3 transcript contradiction is the highest semantic risk. It warned
against two overreactions adopted here: a failed aggregate does not invalidate
strict time/provenance/revision mechanisms individually, and classical
scheduling models cannot be copied directly into learning planning without
consumer evidence. The repository evidence, not reviewer agreement, remains
decisive.

## Correct next boundary

Do not add production Assignment planning code yet. First produce a
consumer-driven architecture proof over representative long-horizon cases:

1. several hours of work with adequate capacity across several days;
2. overlapping assignments from different learning contexts;
3. uncertain and corrected effort estimates;
4. changed daily availability or a missed allocation followed by recomputation;
5. work whose semantic decomposition or learning value needs model help;
6. direct learner override; and
7. an explicit prohibited counterexample showing that minute-scale last-minute
   rescue creates no Repa scheduling requirement.

For each decision, identify the owner, source, uncertainty, correction path,
failure behavior, and exact downstream consumer. Compare bounded rolling-horizon
and workload-leveling ideas from classical scheduling with the Learning
System's real semantics. The program must be able to detect infeasibility and
compute a reproducible allocation from accepted inputs without model
compliance; the model may improve the inputs and propose meaning-sensitive
alternatives.

In parallel, repair the current spine in product-semantic order:

1. bound default transcript composition and make omissions inspectable;
2. separate internal model/control phases from learner-visible output;
3. expose correction-complete course switching and steering withdrawal; and
4. correct target-versus-current architecture wording.

The first two protect the core claim that durable Learning-System state, rather
than accidental prompt history or model prose, governs the product. New feature
work must not proceed by extending dormant v4 inward.
