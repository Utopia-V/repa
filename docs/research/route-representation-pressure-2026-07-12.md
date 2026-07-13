# Broad-route representation pressure result

Date: 2026-07-12

Status: Research observation for ALS-019. It constrains the semantic shape of
the future route domain; it does not select production tables, a graph
database, or a universal ontology.

## Question

Can Repa preserve a useful broad course route as an ordered list with one
current pointer, or do continuation, branching, material revision, and
temporary learning concerns require a wider representation?

This matters before overall architecture because a wrong answer would either
make later continuation ambiguous or encourage every learning concern to be
stored as an edge in one universal graph.

## Method

The lab used paired information-collision cases. Each pair projects to exactly
the same baseline state:

```text
ordered course item ids
+ one current item id
+ optional unversioned material line range
```

The two members nevertheless have different correct answers to a product
query. When this happens, no scheduler, prompt, retrieval strategy, or larger
model can recover the distinction from the baseline: the information is not
there.

The comparison condition retained only the candidate distinctions under
pressure:

```text
versioned ordered course hierarchy
+ sparse typed relations with acceptance and source
+ revision-bound many-to-many material alignment
+ learner route/focus overlay
+ temporary agenda/rejoin overlay
```

The executable fixture is
`labs/route-representation-pressure/route-pressure.test.ts`. It completed six
cases with 29 assertions.

## Results

| Collision | Same baseline | Correct answers that diverge | Distinction required |
| --- | --- | --- | --- |
| nested section vs shallow section | same flattened order and pointer | different breadcrumb | containment hierarchy |
| prerequisite detour vs real rollback | same current item | rejoin the prior target vs continue to the next authored item | broad route anchor, active focus, agenda rejoin |
| deadline jump vs true route advancement | same current assignment item | resume the course vs route is already at the end | agenda is separate from route progress |
| alternatives vs sequential exposition | same authored order | two legal candidates vs one successor | explicit branch semantics |
| accepted vs proposed prerequisite | same order and pointer | block on the prerequisite vs do not block | typed relation, acceptance, provenance |
| current vs changed material | same path/range-shaped projection | use the range vs report it stale | artifact revision binding |

The final case also kept two materials with conflicting expository orders
aligned to the same course items and recorded one learner revisit without
changing the course object or revision. This confirms that course view,
material map, learner overlay, and agenda are different authorities even when
they refer to the same item.

## Interpretation

The user's graph intuition is supported at the logical level, with an
important qualification:

- the course view is graph-shaped because a tree is already a graph and real
  cross-course relations do not fit in a tree;
- its backbone should be a versioned ordered hierarchy because containment and
  authored exposition are common and must not be mistaken for prerequisites;
- only relations with a demonstrated query should become typed cross-edges;
- material structure and alignment form a separate source-bound map;
- learner position, personal concerns, and the current agenda are overlays;
  and
- compact projections of these authorities belong in routine model context,
  while the full map and material remain lazy reads.

In plain language: keep a stable course map, put a few well-labelled lines on
it when they mean something real, and keep “where this learner is”, “which page
supports it”, and “what we temporarily need to do today” on their own layers.
Do not draw every fact into one giant graph.

## What is now earned

1. A production route boundary must not expose only `currentNode`.
2. It must be possible to preserve a broad anchor while focusing elsewhere and
   to name an intended rejoin point.
3. Authored order, accepted prerequisite, branch choice, material alignment,
   personal revisit, and deadline pressure cannot share one untyped relation.
4. A material selector is usable only against the revision it selected.
5. A compact route projection can be a normal query result. Nothing in these
   cases requires a property-graph database; SQLite remains sufficient until
   traversal volume or query shape demonstrates otherwise.

## What is not earned

- a generic `Node`/`Edge` production API;
- an open-ended `related_to` relation;
- pairwise edges as a correct model for arbitrary AND/OR requirements;
- automatic acceptance of LLM-proposed prerequisites or alignments;
- a particular SQLite table layout;
- route-revision migration behavior; or
- claims about teaching quality.

The alternative-branch case proves that branch meaning must be explicit. It
does not decide whether a future real branch needs a choice group, constraint,
or hyperedge. That choice waits for the first actual consumer.

## Architecture gate

Together with ALS-008/009 (bounded, revision-aware material references),
ALS-012 (compact overview plus lazy detail), B2 Trace 6 (continuation from
small durable state), ADR-0011's real runtime trace, and the fresh-Session
production verification on 2026-07-12, this closes the pre-architecture
experiment set.

Further experiments now require a concrete architecture-changing uncertainty
exposed by the real course/material slice. Designing more relation kinds,
schedulers, learner projections, or generic Agent mechanics in advance would
not be evidence-driven.
