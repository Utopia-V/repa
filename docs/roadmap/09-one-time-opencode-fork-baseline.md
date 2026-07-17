# One-time OpenCode fork and native Repa engineering roadmap

Status: Stable engineering roadmap. The original unstarted Gate 7–19 contracts
were superseded on 2026-07-14, and the replacement Gate 7–17 sequence was
accepted on 2026-07-15. Current Gate disposition lives only in
`docs/README.md`; this roadmap does not duplicate volatile close/reopen state.

Original date: 2026-07-13

Recalibrated: 2026-07-14

Decision: [ADR-0014](../decisions/0014-one-time-opencode-fork.md)

Architecture: [Learning-centered system architecture](../architecture/00-system-architecture.md)
and [native learning data model](../architecture/01-native-learning-data-model.md)

Evidence: [Fork provenance and Gate ledger](../fork-ledger.md)

Legacy evidence: [Pre-fork Repa asset disposition audit](../research/pre-fork-repa-asset-audit-2026-07-13.md)

## Goal

Continue the independent TypeScript/Bun Repa product from its admitted native
database into a real learning system. The engineering must give Course,
material, learner, Agenda, Tutor, and Interaction meanings durable structural
homes without copying the pre-fork schema or burying them in generic chat
memory, prompt text, or one universal fact model.

The roadmap is an engineering order, not a product demo script. A Gate may
establish a database, identity, transaction, module, recovery, or integration
boundary before the whole learning experience is usable.

## Why the old future route was withdrawn

Gates 0–6 introduced the fork, product identity, learning-first composition,
terminal product surface, and native database lineage. The old Gate 7–19 route
then ordered work largely by inherited infrastructure surfaces: Interaction,
terminal admission, roots, observation, search, Course focus, one command,
translation, and eventual integration.

That order was not justified by a settled native learning architecture. In
particular, it had not decided the physical relationships among Course Views,
materials, learner records, Agenda, Tutor context, and inherited Interaction
records. Passing each infrastructure Gate could therefore have fixed locally
reasonable structures that combined badly.

That correction withdrew only those unstarted contracts. It did not itself
invalidate Gates 0–6, abandon numbered Gates, or require every future Gate to
complete a learner-visible loop. Later audits remain free to correct an
earlier completion claim without invalidating unrelated later authorities.

## How the next route is formed

1. Grill the overall architecture and engineering direction.
2. Record the accepted authority boundaries, dependency order, and important
   deferred choices.
3. Divide that direction into numbered Gates that can be implemented and
   checked incrementally.
4. Before each Gate begins, grill its local design, failure behavior, and
   evidence boundary again.
5. Implement, verify, and close that Gate before advancing.

A Gate is a maintainer-visible engineering increment. It may be structural and
need not be independently useful to an end user. Its contract states what
becomes true in the repository, which authority owns it, how it composes with
existing state, and what evidence can falsify the claim.

Gate size, diff size, reversibility, user visibility, end-to-end completeness,
and test count are considerations rather than universal directions. Commits,
migrations, tests, reviews, and internal phases do not become extra Gates merely
because they exist.

Verification follows the claim. Documentation corrections receive document
checks. A schema or state transition receives migration, invariant, failure,
and recovery evidence. Integration tests are used when integration is what the
Gate claims. A full suite or real-provider run is not an automatic ritual.

Volatile current status is owned only by [the documentation index](../README.md).

## Fork foundation boundaries

This table names the durable boundary and its original evidence; it is not the
owner of current acceptance status. See [the documentation index](../README.md)
for bounded reopenings and the active control point.

| Gate                           | Durable engineering result                                                                                                | Evidence                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 0. Oracle freeze               | Pre-fork behavior and assets classified before substrate replacement.                                                     | Immutable repa-prefork-oracle tag and asset audit                                                  |
| 1. Lineage and provenance      | Full-history MIT fork at OpenCode v1.17.18.                                                                               | [Fork ledger](../fork-ledger.md#original-gate-close-evidence)                                      |
| 2/2A. Windows baseline         | Released-v1 Windows behavior preserved; one invalid inherited PowerShell test contract diagnosed and corrected.           | Fork ledger                                                                                        |
| 3. Repa identity               | Independent binary, paths, configuration, and database filename with no OpenCode-state fallback.                          | Fork ledger                                                                                        |
| 4. Learning-first composition  | One Repa product identity across interactive carriers and narrow program-owned internal operations.                       | [Gate 4 record](../research/opencode-fork-gate-04-learning-first-composition-2026-07-14.md)        |
| 5. Product-surface disposition | Terminal-only baseline; excluded group behavior disconnected; harmless local capabilities and hibernated source retained. | [Gate 5 record](../research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md) |
| 6. Native database admission   | Repa-owned database identity and migration lineage with one state-owning process per LearnerHome.                         | [Gate 6 record](../research/opencode-fork-gate-06-native-database-admission-2026-07-14.md)         |

At its original close, Gate 6 left baseline schema version 1 admitted, an empty
post-baseline Repa migration registry, and no native learning tables. Later
Gates may add Repa migrations without changing that substrate boundary. There
is no inherited user-data compatibility obligation constraining those learning
migrations.

The numbering above is not a total dependency chain. Gate 4 has no structural
precedence edge to Gates 5–7. Gate 5 determines the reachable carrier set for
Gate 4's final audit and the active entrypoint set that Gate 6 must cover, but
those are coverage relationships rather than shared product meaning. Gate 7
depends on Gate 6's database identity, admission, forward lineage, migration
generator, and one-owner invariant; it does not depend on a particular lock
implementation. A runtime-ownership correction therefore leaves Gate 7 closed
unless it changes those database or migration contracts. Whether that runtime
prerequisite is currently satisfied is volatile state owned by the
documentation index.

## Accepted architecture-grill decisions

### Design depth before Gate decomposition

Before choosing the replacement Gate sequence, establish one coherent logical
skeleton across Course/Course View, source/material, Interaction, learner
record, Agenda, and Tutor context. The skeleton settles:

- stable identities and ownership;
- version, provenance, and correction relationships;
- cross-authority reference direction;
- which state is authoritative and which is a projection; and
- transaction and dependency boundaries that constrain implementation order.

This decision does not freeze complete physical schemas, every column, command
surface, lifecycle, algorithm, or package name. Those details remain local to
the Gate that has enough evidence to own them. Designing only the first module
would leave cross-authority conflicts undiscovered; designing all physical
details now would promote unsupported guesses.

### Session deletion and durable learning provenance

Durable learning state is not an inherited Session/Message/Part cascade child.
Ordinary Session deletion removes transcript-owned rows while a minimal
Repa-owned causal receipt survives without transcript content and records that
the source is unavailable. Course, material, learner, Agenda, route, and policy
state remain under their own deletion and correction lifecycles.

An explicit deep-delete operation may later remove or supersede learning state
derived from a Session after presenting the affected domain scope. Ephemeral
Interaction projections and runtime-only focus may continue to follow Session
deletion.

### Narrow shared command-settlement substrate

All model-issued durable learning commands share one narrow Repa-owned substrate
for causal receipt, physical invocation identity and exact replay, trusted
execution context, permission/time/context revisions, and the exact
model-visible settlement. It also owns the non-content tombstone left when an
originating transcript is deleted.

Each learning authority still owns its semantic effect identity, legal
transition, entity preconditions, correction/supersession rules, and domain
records. The shared substrate does not define a universal learning event,
replay the database, or make inherited OpenCode events the center of learning
state.

## Accepted structural facts

These facts constrain the route but do not determine its Gate order:

- one local LearnerHome and one native database span Courses, LearningSpaces,
  Sessions, learner records, Agenda meaning, and Tutor policy;
- several Courses may be ongoing simultaneously;
- Course belongs to LearnerHome rather than a directory or LearningSpace;
- an optional default Course preference is only a context-selection bias;
- a Course may exist before any Course View, retain multiple View strategies and
  revisions, derive candidate/historical/working relations per exact eligible
  revision, and select zero or one working revision without inventing a
  placeholder route;
- material identity, exact source revision, readable representation, Material
  Map, and Course alignment are different meanings;
- Interaction, source/artifact, Course View, Material Map, learner record,
  Agenda, and Tutor policy remain separate authorities;
- Session history is Interaction truth, not the long-term learning-state
  boundary;
- models may initiate durable learning commands, while the runtime binds trusted
  identity, source, revision, permission, transaction, correction, and tool
  settlement;
- the baseline has no background daemon; time-dependent meaning is derived when
  Repa wakes; and
- the pre-fork oracle and pinned references remain read-only evidence, not
  dependencies or schemas to copy.

## Evidence-constrained dependency graph

The current fork and pre-fork behavior impose a partial order rather than one
linear implementation chain:

```text
native database admission and migrations (already complete)
├─ independent domain identities and revision rules
│  ├─ Course / Course View
│  └─ source / artifact / representation
└─ Interaction causal reference, retention, and command idempotency

stable identities from both sides
├─ Material Map and optional revision-bound Course alignment
├─ learner and Agenda records with typed causal sources or targets
└─ model-issued commands with trusted atomic settlement

real authority reads
└─ Tutor context projections and lazy continuation
```

Course View and source/artifact can be established independently; alignment
needs both. A domain schema or program-owned transition need not wait for model
tool binding. A model-issued durable write does require command/effect identity,
causal binding, retry behavior, and atomic settlement. Tutor context consumes
real authority projections and is not their prerequisite.

The database substrate provides transactional migrations, stable
Session/Message/Part IDs, and atomic settlement of one Session event with its
projection. Repa requires one state-owning process per LearnerHome. The Gate 6
record owns both the invariant and the successive evidence that may establish
or invalidate its runtime implementation; current acceptance is linked from
the documentation index rather than copied here. The inherited database does
not provide an atomic Turn, a durable
learning-command identity, exactly-once tool effects, a global revision, or a
safe long-lived provenance reference: deleting a Session currently removes its
messages, parts, and event aggregate.

## Remaining physical and Gate-local questions

The logical direction is settled far enough to derive an engineering order.
These questions remain for the Gate that owns the affected boundary:

### Native learning storage

- Which physical records and modules first realize the accepted Course and
  Course View model?
- Which identities are stable across revisions, and which records are immutable
  observations or selections?
- Which constraints belong in SQLite, in domain transition code, or in both?

### Interaction and command identity

- Which existing Session, message, part, and event identities are already
  sufficient for learner occurrence, model operation, tool invocation, and
  terminal outcome?
- What narrow additional identity or receipt is genuinely missing?
- Which atomicity and replay guarantees must exist before the first model-issued
  learning write?

### Source, material, and filesystem authority

- How do approved roots, artifact locations, exact revisions, representations,
  selectors, and Course alignment depend on one another?
- Which inherited read, search, permission, and tool-settlement mechanisms can
  be used directly?
- Where does external conversion end and Repa's atomic acceptance begin?

### Learning context and continuity

- Which durable state is authoritative, which state is a bounded projection,
  and which detail remains lazy?
- How do default Course preference, request-specific Course context, working
  Course View, route continuity, Session transcript, and compaction remain
  distinct?

### Learner, Agenda, and planning authorities

- Which learner occurrences or evidence distinctions deserve durable records
  before richer adaptation exists?
- Which future-attention, goal, Assignment, capacity, and allocation meanings
  have independent lifecycle requirements?
- What dependency order avoids both one universal table and a collection of
  disconnected special cases?

### Package and dependency direction

- Which current OpenCode modules can remain domain-independent?
- Where do Repa learning authorities live so the Agent runner composes them
  without owning them?
- Which boundary should be implemented first because later boundaries truly
  depend on it, rather than because it is easiest to see or inherited from the
  old route?

## Gate sequence

Accepted on 2026-07-15 from the settled logical skeleton and dependency
evidence. No Gate below authorizes implementation until its own
pre-implementation grill closes.

The accepted Gate 7, Gate 8, Gate 9, and Gate 10 contracts are recorded in
[Course and Course View authority](../research/opencode-fork-gate-07-course-view-authority-2026-07-15.md),
[learning-command settlement](../research/opencode-fork-gate-08-learning-command-settlement-2026-07-16.md),
[source and Artifact authority](../research/opencode-fork-gate-09-source-artifact-authority-2026-07-16.md),
and
[content-root authority and bounded observation](../research/opencode-fork-gate-10-content-root-authority-2026-07-17.md).

| Gate                                                                                                          | Structural boundary                                                                                                                                                                                                                                        | Why this position                                                                                                                           | Does not imply                                                                                                                                                                                                                                    | Closing evidence direction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7. [Course and Course View authority](../research/opencode-fork-gate-07-course-view-authority-2026-07-15.md)  | Native Course identity, stable View identity, immutable View revisions, stable item identity, closed revision-transition mappings, reversible versioned withdrawal, bounded revision membership and reads, and optional exact versioned working selection. | These identities are referenced by alignment, route, learner, Agenda, and context. They do not depend on material or model-tool settlement. | Material, progress, mastery, a placeholder route, completion/abandonment lifecycle, physical deep deletion, fuzzy identity migration, Git-style merge machinery, automatic candidate promotion, causal provenance proof, or a model-issued write. | Course creation before a View; exact derived candidate/history/working relations; immutable View lineages; no automatic selection movement; stale rejection after learner selection and stale replacement after target withdrawal/restore both fail; the withdrawal/restore matrix preserves parent eligibility and Course clear-only behavior; the ordered-forest and preserve/split/merge contracts reject ambiguous mappings; cross-View item reuse cites an exact source; authorship basis remains creation provenance rather than acceptance state or causal proof; cursor-bounded reads, Multi-Course persistence, restart, and database invariants hold. |
| 8. [Learning-command settlement](../research/opencode-fork-gate-08-learning-command-settlement-2026-07-16.md) | Narrow causal receipt and physical invocation substrate, proven through one Course-owned command.                                                                                                                                                          | A real domain authority prevents the shared seam from becoming speculative; later model-issued writes reuse it.                             | Universal events, global revision, or domain-generic semantic effects.                                                                                                                                                                            | Exact replay, conflicting reuse, Session deletion tombstone, crash boundaries, and atomic domain/result settlement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 9. [Source and Artifact authority](../research/opencode-fork-gate-09-source-artifact-authority-2026-07-16.md) | Logical artifact identity, locations, exact observed revisions, availability, and provenance.                                                                                                                                                              | Source is independent of Course but precedes Material Map, translation, and evidence grounded in exact content.                             | A root owning a Course, automatic classification, or material/Course alignment.                                                                                                                                                                   | Same-path new bytes, move, missing source, immutable old revisions, and correction without retargeting.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 10. [Content-root authority and bounded observation](../research/opencode-fork-gate-10-content-root-authority-2026-07-17.md) | Approved roots, separate read/write grants, revoke semantics, bounded inventory/search, and exact file observation into Gate 9 records.                                                                                                                    | Real filesystem use needs authority and source identity; inherited tools can be reused only after this boundary is explicit.                | Computer-wide indexing, a LearningSpace owner, or automatic semantic import.                                                                                                                                                                      | Allow/revoke/restart, symlink or junction escape, mutation during read, cancellation, and bounded widening.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 11. Readable representation lineage                                                                           | External conversion followed by short atomic acceptance of an immutable representation revision.                                                                                                                                                           | Depends on exact artifact revisions and content authority; Course is unnecessary.                                                           | A universal RAG pipeline, mandatory conversion, or rewriting old selectors.                                                                                                                                                                       | Decline, unsupported input, timeout, malformed output, missing bytes, retranslation, cleanup, and no accepted dangling path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 12. Material Map and Course alignment                                                                         | Revision-bound material outline/selectors plus optional many-to-many alignment to exact Course View revisions/items.                                                                                                                                       | Material Map needs source revisions; alignment needs both independent identity branches.                                                    | Material outline equaling Course route or alignment being required for every source.                                                                                                                                                              | Drift fails closed, unaligned maps remain valid, many-to-many relations, and working-view replacement preserves history.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 13. Learner continuity foundation                                                                             | Learner-owned route anchor and narrowly required progress references, distinct from focus, completion, evidence, and mastery.                                                                                                                              | Depends on Course/View identities and, for model-issued writes, Gate 8 settlement; it need not wait for a general learner ontology.         | One global current item, one active Course, or mastery inference.                                                                                                                                                                                 | Independent Courses, stale anchors, correction, deleted source transcript, and no false semantic promotion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 14. Learning context and Session continuation                                                                 | Default Course preference, request-specific Course selection, bounded authority projections, lazy detail, context cuts when needed, and truthful fresh/resumed Session behavior.                                                                           | Consumes real Course, material, policy, and continuity records; it is not their storage prerequisite.                                       | A second context database, eager transcript import, or a new runtime.                                                                                                                                                                             | Cross-Course requests without preference mutation, restart, compaction, missing detail, and exact projection revisions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 15. Learner record and Tutor adaptation                                                                       | Source-linked occurrences, evidence, and correctable hypotheses only where they alter later Tutor behavior.                                                                                                                                                | Requires causal receipts and typed Course/material targets where relevant; context already has a projection seam to consume them.           | A universal activity table, mastery score, or mandatory structured write per interaction.                                                                                                                                                         | Report/evidence/inference separation, correction, duplicate occurrence handling, zero-write teaching, and attributable adaptation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 16. Agenda authority                                                                                          | Separate goal, future-attention, commitment, deferral, and temporary-detour lifecycles with trusted-time derivation.                                                                                                                                       | Uses existing causal, target, learner, and context boundaries without forcing all Agenda meanings into one shape.                           | A generic todo system, background daemon, or service implying correctness/mastery.                                                                                                                                                                | Eligibility over time, dismissal/supersession/reopen, incompatible current intent, restart, and source preservation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 17. Assignment and planning authority                                                                         | Substantial Assignment obligations, workload/capacity inputs, progress, allocation, infeasibility, and recomputation.                                                                                                                                      | Builds on Agenda and trusted time; begins only after its Gate grill has a representative multi-day planning pressure.                       | Minute-scale rescue, model-owned arithmetic, or every task becoming an Assignment.                                                                                                                                                                | Reproducible allocation, corrected estimates/availability, infeasibility, learner override, and recomputation from accepted inputs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

The sequence establishes dependency-guided engineering order rather than
claiming that later Gate details are already designed. A Gate may be revised or
the later sequence reordered when its grill exposes contradictory evidence,
but a local implementation shape does not silently rewrite the accepted
skeleton.

## Oracle and reference use

Use the pre-fork oracle for behavioral meanings, counterexamples, correction
semantics, and restart/failure evidence. Do not import its runner, schema,
prompt bytes, or tool APIs.

Use pinned OpenCode and Codex references to understand mature provider,
streaming, cancellation, tool, terminal, and storage mechanisms. Reuse a
mechanism only when the same engineering problem exists in Repa. Reference
package topology does not choose Repa's domain boundaries.

## Release and cutover meaning

The fork is already the sole active production line. The pre-fork tree is an
immutable oracle, not a second runtime awaiting deletion.

Individual engineering Gates may close before Repa has a broadly usable
learning release. Release claims are made separately from Gate claims and need
evidence matching the behavior actually promised.

## Correction and stop rules

- A maintainer correction invalidates derived route, Gate, document, code, or
  test assumptions that depended on the old interpretation.
- A passing test proves only the behavior its oracle can distinguish; it does
  not justify the surrounding architecture by itself.
- Dependency order is evidence about implementation order, not proof that two
  modules share product meaning.
- Do not add compatibility paths for experimental learning data that has no
  migration obligation.
- Do not create speculative universal managers, graphs, event tables, state
  machines, or recovery frameworks merely to make later work appear prepared.
- Do not require a structural Gate to impersonate a finished product, and do
  not call an arbitrary partial change a Gate merely because it is small.
- Keep the oracle tag immutable and never dual-run or dual-write the pre-fork
  and fork systems.
