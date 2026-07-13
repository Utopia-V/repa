# Open-world domain modeling from public educational assets

Date: 2026-07-10

Status: Research synthesis and architectural hypothesis. This document does not
yet establish an accepted Domain Pack format or implementation roadmap.

Current scope note (2026-07-11): public curriculum sources, broad routes, and
lazy local expansion remain useful ideas. The Domain Pack and learner-layer
structures below are historical hypotheses and do not define the current
architecture.

## Question

Math Academy obtains reliable task selection from a closed, expert-authored
mathematics curriculum. Agentic Learning System instead operates over arbitrary
local courses and materials.

For common domains such as school mathematics and science, competition
mathematics, and mainstream university subjects such as computer science, the
internet already contains standards, textbooks, course sequences, exercises,
past assessments, and teaching practice. Large language models have also been
trained on substantial educational and technical text.

Can those assets make an open-world learning model feasible without recreating
Math Academy's entire curriculum engineering effort?

## Finding in one sentence

Yes, for well-resourced domains, if the product treats public curricula and
open educational resources as versioned foundations, treats the LLM as a
semantic compiler and proposal generator, and derives local adaptation from the
learner's actual course and evidence. Model parametric memory alone is not a
curriculum database and cannot be the authority for prerequisite or assessment
semantics.

## The user's hypothesis is substantially correct

Mainstream educational domains do not begin from an empty internet.

### School education

China's Ministry of Education publishes the 2022 compulsory-education
curriculum standards, including mathematics, physics, chemistry, biology,
information technology, and other subjects. These documents specify course
goals, content areas, learning expectations, academic-quality expectations, and
implementation guidance. Comparable public structures exist elsewhere, such as
the Common Core mathematics standards.

These are not complete adaptive curricula, but they provide authoritative
vocabulary, scope, grade placement, and intended capabilities.

Competition mathematics is well resourced but less standardized. Art of
Problem Solving publishes detailed course maps and syllabi across algebra,
number theory, counting, probability, geometry, and contest preparation, while
MAA publishes AMC information and past contest material. These provide strong
curricular and task references, but much of the best content is proprietary and
higher olympiad mathematics has no single official fine-grained syllabus. A
competition-mathematics foundation is therefore plausible, but would combine
curated routes and task taxonomies rather than inherit one authoritative school
standard.

### Mainstream university subjects

For computer science, the ACM/IEEE-CS/AAAI CS2023 report provides a global
curricular reference organized by knowledge areas, knowledge units, topics, and
competency expectations. Community curricula such as OSSU add explicit course
sequences and prerequisites. MIT OpenCourseWare and CS50 expose real course
materials and assignments.

Open educational systems go further:

- OpenDSA contains modular text, algorithm visualizations, code exercises,
  proficiency exercises, and assessment infrastructure for data structures,
  algorithms, formal languages, and programming languages.
- Runestone provides open interactive textbooks, executable code, unit-tested
  exercises, Parsons problems, short answers, timed questions, and course
  customization.
- OpenStax and MIT OpenCourseWare provide broad textbook or course collections,
  though current licenses frequently include non-commercial and share-alike
  restrictions.

The educational assets needed by the product therefore already exist in
several partial forms:

| Asset | Typical source | What it contributes |
| --- | --- | --- |
| Scope and outcomes | ministry standards, Common Core, CS2023 | canonical vocabulary and intended capability |
| Course sequence | degree requirements, OSSU, OCW syllabi | coarse order and prerequisites |
| Explanation and examples | textbooks, lecture notes, videos | instructional material |
| Task families | exercise banks, assignments, past papers | occasions for evidence |
| Deterministic checking | unit tests, symbolic answers, interactive exercises | reliable grading for bounded tasks |
| Pedagogical practice | instructor guides, learning-science literature, mature courses | candidate teaching policies |

The opportunity is real: Agentic Learning System can integrate and personalize
an existing educational commons rather than author every domain from scratch.

Sources:

- PRC Ministry of Education,
  [Compulsory Education Curriculum Plan and Standards (2022)](https://www.moe.gov.cn/srcsite/A26/s8001/202204/t20220420_619921.html)
- [Common Core Mathematics Standards](https://corestandards.org/mathematics-standards/)
- Art of Problem Solving, [course recommendations](https://artofproblemsolving.com/school/recommendations)
- Mathematical Association of America,
  [American Mathematics Competitions](https://maa.org/student-programs/amc/)
- ACM/IEEE-CS/AAAI, [Computer Science Curricula 2023](https://csed.acm.org/)
- [OSSU Computer Science](https://github.com/ossu/computer-science)
- [OpenDSA](https://opendsa.org/)
- [Runestone Academy](https://runestone.academy/ns/books/published/overview/index.html)
- [CS50 OpenCourseWare](https://cs50.harvard.edu/x/)
- [MIT OpenCourseWare](https://openlearning.mit.edu/courses-programs/mit-opencourseware)

## What is still missing

Availability of content is not the same as availability of a learning model.
Public resources are heterogeneous and answer different questions:

- a standard says what should be learned, not necessarily the best dependency
  graph or task sequence;
- a textbook's order reflects exposition and institutional convention, not a
  proven prerequisite graph;
- a course syllabus describes one implementation, not a universal route;
- an exercise may have an answer but no explicit statement of which claims it
  assesses or which errors it diagnoses;
- community roadmaps provide useful recommendations but are not calibrated
  learner models;
- internet popularity is not evidence of pedagogical quality;
- copyrighted availability does not imply permission to redistribute or derive
  a packaged dataset.

The scarce layer is therefore **alignment**:

```text
outcome <-> domain claim <-> material <-> task family
        <-> scoring evidence <-> prerequisite or integration relation
```

Math Academy has authored and calibrated this alignment. An open system must
construct it from partial assets and admit uncertainty.

## Model memory is useful, but not in the way a database is useful

It is reasonable to expect a capable LLM to possess broad semantic knowledge of
school subjects and mainstream computer science. It can usually:

- normalize names and aliases across sources;
- propose a first decomposition of a familiar topic;
- map a syllabus item to a standard or textbook section;
- suggest likely prerequisites and common misconceptions;
- convert a task into a structured candidate specification;
- generate explanations and exercise variants;
- identify missing links for later verification.

But the exact contents of a model's training corpus are not queryable, its
parametric knowledge has no stable citation boundary, and fluent answers do not
demonstrate reliable curriculum structure.

The strongest direct evidence found is K12-KGraph, released in May 2026. It
contains 6,579 concepts, 1,364 skills, 652 experiments, and 1,171 exercises
extracted from 48 People's Education Press mathematics, physics, chemistry, and
biology textbooks. Its authors distinguish ordinary question answering from
"curriculum cognition": knowing prerequisite chains, taxonomy, experimental
evidence, assessment links, and textbook location.

On its graph-derived benchmark, the best evaluated proprietary model reached
57.1% exact match; GPT-5.2 reached 42.8%. Strong factual and exam-question
performance therefore did not imply reliable knowledge of curriculum
relationships.

More importantly, the graph was not accepted directly from an LLM. Its pipeline
used:

1. source textbooks parsed into section-level material;
2. schema-constrained LLM extraction;
3. an evidence citation from the textbook for each relation;
4. hierarchical entity merging and alias reconciliation;
5. cycle detection for taxonomy and prerequisites;
6. manual verification by 12 subject-qualified annotators.

The resulting annotator agreement was strong, but it came from a hybrid
pipeline, not zero-shot model memory. The project is exceptionally relevant to
Repa because it demonstrates both feasibility and the missing labor.

Sources:

- [K12-KGraph paper](https://arxiv.org/abs/2605.09635)
- [K12-KGraph repository](https://github.com/haolpku/K12-Dataset)

## LLM-generated tasks are plausible candidates, not automatically calibrated items

Research on question generation gives a similarly balanced result.

LLMs can produce useful questions when given source context, explicit cognitive
targets, examples, rubrics, and iterative critique. A 2025 field study across
91 classes and nearly 1,700 students found that iteratively refined AI-generated
items performed comparably to expert-created standardized-exam items in its
sample.

Other studies find substantial variation by model and prompting method. School
question generation improves with worked examples, while zero-shot questions
are more likely to be shallow or poorly aligned. Automated evaluation also does
not consistently match human pedagogical judgment.

The implementation consequence is not to forbid generated exercises. It is to
make generation part of a typed pipeline:

```text
claim and task-family target
-> grounded source context
-> generated task + solution + rubric
-> deterministic or independent checks where possible
-> trial evidence
-> retained, revised, or discarded task
```

An item can be factually correct without having known difficulty,
discrimination, or diagnostic value. Calibration is a later empirical property,
not a field the LLM may invent.

Sources:

- Isley et al.,
  [Assessing the Quality of AI-Generated Exams](https://www.hks.harvard.edu/publications/assessing-quality-ai-generated-exams-large-scale-field-study)
- Maity, Deroy, and Sarkar,
  [Can large language models meet the challenge of generating school-level questions?](https://doi.org/10.1016/j.caeai.2025.100370)
- Scaria, Chenna, and Subramani,
  [Automated Educational Question Generation at Different Bloom's Skill Levels](https://arxiv.org/abs/2408.04394)

## Proposed architecture: foundations, overlays, and evidence

The product does not need one universal, perfect knowledge graph. It needs
three separately versioned layers.

```text
Domain Foundation
  public standards + curated routes + open materials + task families
                  |
                  v
Course Overlay
  user's syllabus + instructor emphasis + local materials + exams + DDLs
                  |
                  v
Learner Layer
  claims + evidence + errors + artifacts + review obligations + preferences
```

### Domain Foundation

A reusable foundation for a well-resourced domain. Internally this can become a
versioned **Domain Pack**, but the term should not imply executable plugin code.

A pack may contain:

```text
source manifest, versions, and licenses
canonical concepts, capabilities, and aliases
high-value prerequisite and integration relations
curricular views for standards or common course sequences
material references and retrieval indexes
task-family definitions
rubrics and deterministic verifiers
common misconception hypotheses
assessment-blueprint templates
provenance and validation status for every durable assertion
```

It should usually reference or index source content rather than blindly copy it.
Licensing must be tracked per asset. For example, K12-KGraph's dataset is
CC BY-NC-SA 4.0 while its pipeline code is MIT; current OpenStax and MIT OCW
materials generally have non-commercial restrictions; OpenDSA's project is MIT
licensed. Public accessibility alone cannot decide product reuse.

### Course Overlay

The overlay maps the foundation to the course the learner is actually taking:

```text
local names and chapter order
included and excluded scope
instructor-specific conventions
assigned materials and exercises
grading policy and exam blueprint
deadlines and available time
```

This prevents a globally reasonable CS route from overriding the reality of a
particular operating-systems course or examination.

The overlay can be built largely through retrieval-backed LLM extraction because
its claims can cite the syllabus, assignment, lecture, or past paper that
supports them.

### Learner Layer

This layer remains local and evidence-led. It does not alter the shared domain
foundation when one learner makes an error. It records which claims are
supported under which conditions and which task or explanation exposed a
possible gap.

Repeated local evidence may suggest a correction to a pack, but promotion into
the shared foundation requires a separate review path.

## Provenance states are more useful than one confidence score

Every durable domain assertion should carry a status that describes why it is
present:

```text
authoritative_source
  directly represents a named standard, official syllabus, or authored rubric

curated
  reviewed and accepted as a foundation-level teaching assertion

source_grounded
  extracted or inferred from cited source passages but not fully reviewed

model_proposed
  supplied from model prior or analogy and awaiting supporting evidence

empirically_supported
  strengthened by task or learner data under stated conditions

contested
  credible sources or observations conflict

deprecated
  retained for migration and audit, but no longer used for planning
```

These are not simply levels on one ladder. A government standard can be
authoritative about intended scope while remaining silent about the best
prerequisite relation. Empirical performance can support a task's difficulty
without making its explanation pedagogically ideal.

## Construction pipeline

For a well-resourced domain, a practical pipeline is:

1. **Inventory sources.** Identify standards, respected course designs, open
   texts, exercises, assessments, and pedagogical references. Record version,
   locale, authority, and license.
2. **Extract typed candidates.** Use constrained LLM output to identify domain
   nodes, capabilities, tasks, relations, aliases, and source anchors.
3. **Reconcile across sources.** Merge aliases while preserving disagreements
   among curricular views instead of forcing a false universal sequence.
4. **Validate structural invariants.** Check dangling references, illegal edge
   kinds, cycles where the relation requires a DAG, and contradictions with
   source location or task metadata.
5. **Prioritize semantic review.** Review edges and task families according to
   planning impact. A prerequisite that gates a large subgraph deserves more
   scrutiny than a low-impact related-topic link.
6. **Attach verifiers.** Prefer tests, symbolic solvers, reference answers,
   rubrics, and constrained graders where the domain permits them.
7. **Build the course overlay.** Map local syllabus, instructor materials,
   assignments, and past papers onto the foundation.
8. **Improve from use.** Track whether tasks elicit the intended evidence and
   whether proposed prerequisite repairs actually predict later success.

This pipeline uses the LLM to reduce editorial work, not to eliminate the need
for epistemic accountability.

## Capability grades and honest degradation

The system should know how much infrastructure supports a domain or course.

### Pack-backed

The course maps well to a reviewed Domain Pack with useful task families and
verifiers. Fine-grained planning, diagnosis, and review are available.

Examples likely to become suitable first:

- school mathematics and much of school physics;
- introductory programming;
- data structures and algorithms;
- discrete mathematics;
- bounded parts of systems courses with executable or objective tasks.

### Source-grounded

The course has a syllabus, materials, assignments, and perhaps past papers, but
no mature shared pack. The system can organize scope, retrieve explanations,
create provisional claims, and gather evidence, while keeping dependencies and
diagnoses tentative.

This may cover operating systems, databases, networks, machine learning, and
many ordinary university courses reasonably well before a full pack exists.

### Ad hoc

The learner is exploring an open question with sparse or conflicting sources.
The system provides workspace orchestration, traces claims and materials, and
helps design activities, but does not claim fine-grained adaptive mastery or
optimized sequencing.

These are capability profiles, not judgments about the worth of a subject.
They prevent the product from presenting Math-Academy-like certainty where the
supporting educational engineering does not exist.

## Feasibility judgment

The original product is technically plausible without recreating Math Academy
for every subject, but only after narrowing the claim:

> The first strong version should be a learning agent over well-resourced
> domains and source-grounded local courses, with reusable Domain Foundations
> and honest degradation outside them.

Its advantage over Math Academy need not be a more perfect universal graph. It
can be:

- operating across the learner's real courses, files, code, assignments, and
  examinations;
- mapping those local realities onto shared curricular foundations;
- using the LLM to translate among heterogeneous educational assets;
- accumulating evidence and adapting locally;
- exposing provenance and uncertainty instead of hiding missing calibration.

The central technical bet is therefore not "the LLM already knows the
curriculum." It is:

> A capable model can compile abundant public educational knowledge and local
> course evidence into a useful, incrementally validated learning model at much
> lower cost than authoring that model by hand.

The research supports that bet as plausible. It does not support treating the
model's first graph or generated exercise as correct by default.

## Consequences for current design

1. Domain modeling should support multiple source-backed curricular views, not
   one universal course order.
2. Provenance and license metadata belong in the foundation model from the
   beginning.
3. Domain Packs should be versioned data artifacts separated from learner state
   and workspace files.
4. The LLM should propose and align; deterministic validators, source evidence,
   reviewed packs, and learner observations should stabilize.
5. Task calibration and prerequisite quality must remain empirical properties.
6. Planning must degrade according to domain support instead of silently using
   equally confident behavior everywhere.
7. Early domain work should favor areas with abundant authoritative structure,
   open tasks, and reliable verification rather than arbitrary subject breadth.

## Research still needed

- Inspect the actual K12-KGraph schema, extraction prompts, and released data
  quality rather than relying only on the paper's reported evaluation.
- Compare CS2023, OSSU, representative university curricula, OpenDSA, and
  Runestone at the granularity needed for a CS Domain Foundation.
- Test whether current models can align a real Chinese university syllabus and
  past papers to such a foundation with useful provenance.
- Determine a license-safe distinction among indexing, local user-side
  extraction, redistribution, and derived Domain Pack content.
- Design an impact-based review mechanism that can validate a sparse useful
  graph without requiring an expert to inspect every possible concept pair.

These are bounded engineering and empirical investigations. They do not require
the user to pre-design the curriculum model before implementation begins.
