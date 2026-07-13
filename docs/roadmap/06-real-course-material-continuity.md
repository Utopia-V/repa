# Real course and material continuity

Date: 2026-07-12

Status: Completed on 2026-07-12 under ADR-0012. Deterministic, failure, reopen,
cross-process ownership, correction, and real-provider evidence is recorded in
[`../research/phase-1-course-continuity-verification-2026-07-12.md`](../research/phase-1-course-continuity-verification-2026-07-12.md).

## Outcome

Move from a Tutor that can converse and retain policy to a Tutor that can form,
begin, and continue a real course with or without pre-existing local material.

A learner may point Repa at a local Markdown course/chapter or simply ask to
learn a subject. With material, the Tutor derives a source-grounded ordered
view and reads only relevant ranges. Without material, ordinary Agent research
and semantic capabilities create a coarse provisional route that can be used
and corrected immediately. Both paths retain route/material position when
useful and continue in a new Session without learner resynchronization or old
transcript replay.

## Product path

```text
local-material start: request -> revision-bound artifact -> ordered hierarchy
no-material start: request -> agent research/prior -> provisional hierarchy
                              |
                              v
                one versioned working Course View
                              |
                              v
active route anchor -> bounded source read when available -> teaching/work
-> modest progress/position update -> new Session -> relevant continuation
```

The ordered hierarchy is the backbone of the graph-shaped route hypothesis. No
cross-edge is added until a real branch, prerequisite, or alignment case needs
one. Learner progress and the near-term plan remain overlays rather than edits
to the course view.

## Required capabilities

1. Register a local material artifact with a content revision and workspace-
   confined path.
2. Read Markdown headings and ranges without sending the entire artifact on
   every model request.
3. Preserve an ordered parent/child course view and material anchors.
4. Put a compact active-course/position projection into each relevant model
   sample.
5. Let the model request a bounded material range through a read-only tool.
6. Let the Tutor explain or demonstrate from that range without forcing a quiz.
7. Record only the position/progress fact that a later continuation consumes;
   reading or explanation remains distinct from mastery.
8. In a new Session containing only "continue", choose and load the relevant
   source range without replaying the complete earlier transcript.
9. Detect a changed material revision and refuse to silently reuse a stale
   range.
10. When no course/material exists, let the Agent create a coarse working
    Course View with explicit model/source provenance, use it without a setup
    ceremony, and correct or supersede it later.

## Implementation boundary

- Follow ADR-0012 and the completed course-continuity boundary recorded in
  [`architecture-led-build-sequence.md`](./architecture-led-build-sequence.md);
  do not turn this milestone into a parallel architecture.
- Extend the existing single-process Tutor loop; do not build a second runtime.
- Keep filesystem reading domain-independent and workspace-confined.
- Keep route/material/progress semantics in the learning layer and inject only
  a bounded projection into context.
- Treat the logical route as a versioned ordered hierarchy with sparse typed
  relations, while material alignment, learner route/focus, and the agenda
  remain separate authorities. ALS-019 earned these distinctions but not a
  production table layout or universal graph API.
- Use deterministic Markdown structure as the grounded path and a
  model-authored provisional route as the ungrounded/research path. They share
  one Course View authority; neither receives a separate runtime.
- SQLite adjacency and ordinary queries are sufficient for this milestone;
  graph-database selection is out of scope.

## Verification

- A fixture course covers nested headings, exact ranges, restart, and source
  revision drift.
- A deterministic model trace proves material read -> teaching -> position
  write -> later continuation.
- A no-material trace proves agent route creation -> visible provisional basis
  -> teaching -> correction/supersession without inventing hard prerequisites.
- A bounded real-provider trace teaches from a local artifact and then resumes
  it in a new Session with no old transcript in that Session.
- The full repository check remains green.

## Non-goals

- no universal prerequisite ontology or automatic dense knowledge graph;
- no PDF/video ingestion in this milestone;
- no vector database;
- no scalar mastery model;
- no scheduler or FSRS integration; and
- no full-screen TUI redesign.

## Exit gate

The milestone exits only when both course-start paths use the same durable
Course View authority: one real local Markdown path teaches from an exact
source range, one no-material path creates a usable provisional route, and a
new Session continues from durable course/material state without the learner
restating the path/position or receiving the first Session's whole transcript.

Exit result: passed. Both genesis paths, explicit correction/supersession,
revision-drift realignment, and a real fresh-Session Markdown continuation now
use the same Course View, route, context, and capability boundaries.
