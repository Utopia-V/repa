# One-time OpenCode fork and native Repa engineering roadmap

Status: Stable engineering roadmap. The original unstarted Gate 7–19 contracts
were superseded on 2026-07-14, and the replacement Gate 7–17 sequence was
accepted on 2026-07-15. The 2026-07-17 post-Gate-10 global audit preserved
Gates 7–11 and replaced the unstarted route after Gate 11 with Gates 12–23. The
2026-07-21 Gate 16 grill corrected the still-unstarted Gate 21 and Gate 23
composition so cross-day planning may consume a Goal or Assignment without
merging those authorities. A 2026-07-27 documentation audit reconciled TUI
product surface, interactive/internal model-operation boundaries, and retained
carriers versus the released-v1 runtime. The following first-principles audit
then withdrew `/learn` as a pre-settled admission answer, required one connected
feedback trace and a real planning consumer, and corrected the false universal
Agenda/provenance interpretations. Current Gate disposition lives only in
`docs/README.md`; this roadmap does not duplicate volatile close/reopen state.

Original date: 2026-07-13

Recalibrated: 2026-07-14, 2026-07-17, and 2026-07-21

Documentation reconciled: 2026-07-27

Decision: [ADR-0014](../decisions/0014-one-time-opencode-fork.md)

Architecture: [Learning-centered system architecture](../architecture/00-system-architecture.md)
and [native learning data model](../architecture/01-native-learning-data-model.md)

Evidence: [Fork provenance and Gate ledger](../fork-ledger.md)

Legacy evidence: [Pre-fork Repa asset disposition audit](../research/pre-fork-repa-asset-audit-2026-07-13.md)

## Goal

Continue the independent TypeScript/Bun Repa product from its admitted native
database into a real learning system. The engineering must give Course,
material, learner, Goal, future-attention, Assignment, planning, Tutor, and
Interaction meanings truthful structural homes without copying the pre-fork
schema or burying them in generic chat memory, prompt text, one universal
Agenda owner, or one universal fact model.

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
materials, learner records, agenda-family authorities, Tutor context, and
inherited Interaction records. Passing each infrastructure Gate could
therefore have fixed locally reasonable structures that combined badly.

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

Before freezing a Gate contract, classify its consequential claims:

- deterministic authority or mechanics use state, transaction, migration,
  fault, cancellation, and restart evidence;
- accepted model-mediated behavior transferred into the fork receives bounded
  native-provider qualification; and
- a new behavior whose result could change ownership, representation, or
  control policy receives a bounded experiment before the contract fixes that
  choice.

Engineering benchmarks answer engineering questions such as context budgets or
conversion cost; they are not relabeled as learning experiments. A real
provider is evidence for a behavioral or integration claim, not an independent
Gate.

Volatile current status is owned only by [the documentation index](../README.md).

## Fork foundation boundaries

This table names the durable boundary and its original evidence; it is not the
owner of current acceptance status. See [the documentation index](../README.md)
for bounded reopenings and the active control point.

| Gate                           | Durable engineering result                                                                                                | Evidence                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 0. Oracle freeze               | Pre-fork behavior and assets classified before substrate replacement.                                                     | Immutable repa-prefork-oracle tag and asset audit                                                  |
| 1. Lineage and provenance      | Full-history MIT fork at OpenCode v1.17.18.                                                                               | [Fork ledger](../fork-ledger.md#gate-close-evidence)                                               |
| 2/2A. Windows baseline         | Released-v1 Windows behavior preserved; one invalid inherited PowerShell test contract diagnosed and corrected.           | Fork ledger                                                                                        |
| 3. Repa identity               | Independent binary, paths, configuration, and database filename with no OpenCode-state fallback.                          | Fork ledger                                                                                        |
| 4. Learning-first composition  | One Repa product identity across interactive carriers and narrow program-owned internal operations.                       | [Gate 4 record](../research/opencode-fork-gate-04-learning-first-composition-2026-07-14.md)        |
| 5. Product-surface disposition | Terminal-only baseline with independent outward product identity; excluded group behavior disconnected; harmless local capabilities and hibernated source retained. | [Gate 5 record](../research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md) |
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
record, agenda-family authorities, and Tutor context. The skeleton settles:

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
the source is unavailable. Course, material, learner, Goal, future-attention,
Assignment, planning, route, and policy state remain under their own deletion
and correction lifecycles.

Selective cross-authority deep deletion has an explicit post-baseline Data
Lifecycle owner. It waits until every referring authority can compute the exact
affected scope, presents that scope before commit, and requires explicit
learner authorization. It does not block the first planned product boundary.
Ephemeral Interaction projections and runtime-only focus may continue to follow
ordinary Session deletion; withdrawal, correction, and whole-home removal do
not masquerade as selective deep deletion.

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
  Sessions, learner records, Goal, future-attention, Assignment, planning, and
  Tutor-policy meaning;
- several Courses may be ongoing simultaneously;
- Course belongs to LearnerHome rather than a directory or LearningSpace;
- an optional default Course preference and each Course's route anchor are
  learner navigation-continuity state, not Context-owned writes;
- a Course may exist before any Course View, retain multiple View strategies and
  revisions, derive candidate/historical/working relations per exact eligible
  revision, and select zero or one working revision without inventing a
  placeholder route;
- material identity, exact source revision, readable representation, Material
  Map, and Course alignment are different meanings;
- Interaction, source/artifact, Course View, Material Map, learner record,
  Goal, future-attention, Assignment, planning, and Tutor policy remain
  separate authorities; `Agenda` may name their composition family but owns no
  shared lifecycle or transaction;
- Session history is Interaction truth, not the long-term learning-state
  boundary;
- models may initiate durable learning commands, while the runtime binds trusted
  identity, source, revision, permission, transaction, correction, and tool
  settlement;
- one admitted learner request belongs to a durable finite Turn with an honest
  terminal outcome; first ordinary input atomically admits its Session and Turn
  rather than leaving an orphan Session;
- natural-language bootstrap reaches Course and source/material authorities
  through their own commands and shared settlement rather than through fixtures
  or a universal CRUD layer;
- retained steering, Goal, future attention, and Assignment keep separate
  ownership and lifecycle meaning;
- the baseline has no background daemon; time-dependent meaning is derived when
  Repa wakes; and
- the pre-fork oracle and pinned references remain read-only evidence, not
  dependencies or schemas to copy.

## Evidence-constrained dependency graph

The current fork and pre-fork behavior impose a partial order rather than one
linear implementation chain:

```text
native database admission and migrations (already complete)
├─ Course / Course View
├─ source / Artifact / ContentRoot / representation
├─ learning-command settlement
└─ inherited Interaction -> durable Turn

Course + source/representation -> Material Map and Course alignment
Course + Turn/settlement -> navigation continuity, retained steering, Goal

the authorities above -> natural-language learning bootstrap
the authorities above -> bounded learning context and Session continuation

bounded context + exact occurrences
├─ first learner-record adaptation
├─ source-linked future attention and Tutor return
└─ Goal or Gate-21-admitted Assignment -> substantial cross-day planning

all product-domain reads and correction paths
-> learning-native TUI inspect/correct
-> integrated Learning-System product loop
```

Course View and source/artifact can be established independently; alignment
needs both. Durable Turn is independent of representation but is a high-fan-out
prerequisite for later context, steering, and truthful service. Navigation,
steering, and Goal do not depend on one another. Learner adaptation, future
attention, Goal, and Assignment may each arise from existing trusted sources;
their linear numbering does not create semantic foreign-key dependencies.
Cross-day planning may consume an exact Goal or Assignment revision, but that
consumer relation does not merge either producer's identity or lifecycle. A
model-issued durable write still requires command/effect identity, causal
binding, retry behavior, and atomic settlement. Tutor context consumes real
authority projections and is not their storage prerequisite.

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

## Accepted boundaries and Gate-local questions

Gates 7–16 produced reviewed answers to the original Course identity,
command-settlement, source/Artifact, ContentRoot, bounded-observation,
Representation, durable-Turn, Material Map/alignment, navigation-continuity,
retained-steering, and Goal-authority questions. Review provenance does not
make those answers axioms: contradictory product evidence must revise the
owning boundary and every affected dependent. Current Gate status remains
owned by `docs/README.md`; this roadmap records only stable topology,
prerequisites, and candidate evidence boundaries.

Natural-language bootstrap cannot become implementation authority while any
of these existing-owner prerequisites is false:

- terminal-only composition is the registered default build, Repa-owned config
  no longer writes upstream schema URLs, and reachable help/network metadata
  identifies Repa rather than OpenCode unless an exact provider contract
  requires a recorded and tested interoperability literal;
- restricted custom Agents compile from one authoritative capability catalog
  as default-deny plus explicit allows;
- consequential permission and settlement meaning is visible through one
  shared semantic projection in the primary TUI;
- generic learning-command storage stops enumerating domain effects;
- behavioral trigger DDL is frozen and migrated from real historical fixtures;
  SQLite owns structural invariants rather than natural-language forensics; and
- Gate 16's open Goal interpretation works without fixed command phrases or
  learner-visible internal IDs.

These prerequisites repair existing owners and evidence. They are not another
numbered Gate, do not themselves authorize bootstrap implementation, and do
not import Gate 22's later general inspect/correct surface.

The following implementation questions belong to the Gate that can answer
them. Recording them preserves engineering context; a linked draft may propose
answers, but this roadmap does not pre-accept them:

- **Gate 17 — natural-language bootstrap:** the exact Course and Artifact
  command surfaces, request-bound creation/effect slots, atomic-versus-staged
  composition, cross-authority partial truth, provisional route construction,
  same-Turn teaching, and correction while preserving separate domain
  ownership. Whether `/learn` is mandatory, an optional shortcut, or
  unnecessary remains a Gate-local design question; any retained envelope must preserve verifiable
  admission provenance and be discoverable in the primary TUI, but syntax does
  not decide new/continue, macro activity, or whether a domain write is legal.
  Goal and LearningSpace remain optional. Transient web research without an
  admitted exact remote Artifact/snapshot does not make route assertions
  source-grounded.
- **Gate 18 — learning context:** projection manifest, selection/budget rules,
  lazy-detail query shape, compaction threshold, and fresh/resumed Session
  presentation.
- **Gate 19 — learner adaptation:** the first source-linked distinction is
  admitted only after a bounded experiment demonstrates a later-action
  collision that current state cannot recover honestly; exact inference and
  aggregation remain consumer-earned.
- **Gate 20 — future attention/return:** time and target representation,
  multiple-candidate handling, the narrow source-bound learner-role constraint,
  and atomic service after one complete source-aligned occurrence.
- **Gate 21 — cross-day planning:** representative Goal-driven and
  Assignment-driven multi-day pressure must precede the contract. The bounded
  experiment must distinguish the no-Assignment OS-18/DS-20 exam case when
  study starts on the 16th from the same Goals when study starts ten days
  earlier, rather than encode a static Goal priority. Exact planning-demand,
  estimate, capacity, allocation, infeasibility, override, and recomputation
  algorithms remain local. The current candidate number includes the
  independent Assignment producer needed by the Assignment path; evidence may
  return to the roadmap owner to split or defer that producer rather than
  hiding obligation identity inside planning state. A correct allocation is
  not sufficient until an exact later context or Tutor decision consumes it
  and changed accepted inputs can change the later move.
- **Gate 22 — TUI inspect/correct:** the primary natural-language TUI composes
  navigation and rendering over existing domain queries/correction paths.
  Diagnostic CLI commands may assist but cannot close the product-surface
  claim alone. Inspection distinguishes durable owner state, behavior it could
  affect, and exact context/plan/action consumption that actually occurred;
  absent consumption remains visibly none or pending. This Gate does not
  invent missing domain lifecycles.
- **Gate 23 — integrated product loop:** one smallest connected causal trace
  from learning move through learner occurrence/outcome and an owned durable
  consequence to revised context/plan and a changed later Tutor move;
  one product-floor composition from bootstrap and useful teaching through
  exact recent Interaction/route state to a useful continuation in a fresh
  Session without eager transcript replay; one zero-write learner-feedback
  trace in which confusion or correction materially changes the next peer
  teaching move without inventing learning state; orthogonal coverage/failure
  traces, bounded real-provider qualification, and proof that all retained
  interactive carriers converge on one released-v1 production model/Turn spine
  with no shadow learning path.

Exact table/column/package names, prompt wording, converter executables,
temporary directory layout, TUI widgets, token thresholds, test file counts,
and commit slices remain implementation details. They stay recorded here by
category and are decided only by the owning Gate's current evidence.

## Gate sequence

Gates 7–10 and the original future skeleton were accepted on 2026-07-15. The
2026-07-17 global audit preserved Gate 11 and accepted the revised future
sequence through Gate 23. No Gate below authorizes implementation until its own
pre-implementation grill closes and any required contract review is accepted.

The accepted Gate 7, Gate 8, Gate 9, and Gate 10 contracts are recorded in
[Course and Course View authority](../research/opencode-fork-gate-07-course-view-authority-2026-07-15.md),
[learning-command settlement](../research/opencode-fork-gate-08-learning-command-settlement-2026-07-16.md),
[source and Artifact authority](../research/opencode-fork-gate-09-source-artifact-authority-2026-07-16.md),
and
[content-root authority and bounded observation](../research/opencode-fork-gate-10-content-root-authority-2026-07-17.md).

| Gate                                                                                                                         | Structural boundary                                                                                                                                                                                                                                        | Why this position                                                                                                                                                                          | Does not imply                                                                                                                                                                                                                                    | Closing evidence direction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7. [Course and Course View authority](../research/opencode-fork-gate-07-course-view-authority-2026-07-15.md)                 | Native Course identity, stable View identity, immutable View revisions, stable item identity, closed revision-transition mappings, reversible versioned withdrawal, bounded revision membership and reads, and optional exact versioned working selection. | These identities are referenced by alignment, navigation continuity, learner state, agenda-family authorities, and Context. They do not depend on material or model-tool settlement.        | Material, progress, mastery, a placeholder route, completion/abandonment lifecycle, physical deep deletion, fuzzy identity migration, Git-style merge machinery, automatic candidate promotion, causal provenance proof, or a model-issued write. | Course creation before a View; exact derived candidate/history/working relations; immutable View lineages; no automatic selection movement; stale rejection after learner selection and stale replacement after target withdrawal/restore both fail; the withdrawal/restore matrix preserves parent eligibility and Course clear-only behavior; the ordered-forest and preserve/split/merge contracts reject ambiguous mappings; cross-View item reuse cites an exact source; authorship basis remains creation provenance rather than acceptance state or causal proof; cursor-bounded reads, Multi-Course persistence, restart, and database invariants hold. |
| 8. [Learning-command settlement](../research/opencode-fork-gate-08-learning-command-settlement-2026-07-16.md)                | Narrow causal receipt and physical invocation substrate, proven through one Course-owned command.                                                                                                                                                          | A real domain authority prevents the shared seam from becoming speculative; later model-issued writes reuse it.                                                                            | Universal events, global revision, or domain-generic semantic effects.                                                                                                                                                                            | Exact replay, conflicting reuse, Session deletion tombstone, crash boundaries, and atomic domain/result settlement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 9. [Source and Artifact authority](../research/opencode-fork-gate-09-source-artifact-authority-2026-07-16.md)                | Logical artifact identity, locations, exact observed revisions, availability, and provenance.                                                                                                                                                              | Source is independent of Course but precedes Material Map, translation, and evidence grounded in exact content.                                                                            | A root owning a Course, automatic classification, or material/Course alignment.                                                                                                                                                                   | Same-path new bytes, move, missing source, immutable old revisions, and correction without retargeting.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 10. [Content-root authority and bounded observation](../research/opencode-fork-gate-10-content-root-authority-2026-07-17.md) | Approved roots, separate read/write grants, revoke semantics, bounded inventory/search, and exact file observation into Gate 9 records.                                                                                                                    | Real filesystem use needs authority and source identity; inherited tools can be reused only after this boundary is explicit.                                                               | Computer-wide indexing, a LearningSpace owner, or automatic semantic import.                                                                                                                                                                      | Allow/revoke/restart, symlink or junction escape, mutation during read, cancellation, and bounded widening.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 11. [Readable representation lineage](../research/opencode-fork-gate-11-readable-representation-lineage-2026-07-17.md)       | External conversion followed by short atomic acceptance of an immutable representation revision.                                                                                                                                                           | Depends on exact Artifact revisions and content authority; Course and Turn are unnecessary.                                                                                                | A universal RAG pipeline, mandatory conversion, rewriting old selectors, or silently following source drift.                                                                                                                                      | Decline, unsupported input, timeout, malformed output, missing bytes, availability/deletion truth, exact drift pairs, retranslation, explicit old-version use, cleanup, and no accepted dangling path.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 12. Durable Turn lifecycle                                                                                                   | One admitted root learner request begins a durable finite Turn that may later admit exact-target steers, groups model operations and tools, has one terminal outcome, enforces independent budgets, and atomically admits the first Session+Turn.             | Gate 8 supplies occurrence/invocation settlement; later steering, Context, service, and product-loop claims need whole-Turn truth.                                                         | A second runner, durable provider-work replay, a durable macro-activity queue, a universal event store, or replacing typed Session items.                                                                                                          | Atomic first admission with no orphan Session; exact steer promotion versus unadmitted next-Turn draft; unique complete/failed/interrupted/exhausted outcomes; model/tool budgets and exhaustion receipt; cancellation, provider failure, owner loss, crash orphan settlement, restart, and exact reuse of existing identities where honest.                                                                                                                                                                                                                                                                                                                           |
| 13. [Material Map and Course alignment](../research/opencode-fork-gate-13-material-map-alignment-2026-07-19.md)              | Revision-bound material outline/selectors plus optional many-to-many alignment to exact Course View revisions/items.                                                                                                                                       | Material Map needs source or representation revisions; alignment needs both independent identity branches.                                                                                 | Material outline equaling Course route, alignment being required for every source, automatic generation/acceptance, or RAG/indexing.                                                                                                              | Drift fails closed, unaligned maps remain valid, many-to-many relations, exact selectors, stale working-view targets, and working-view replacement preserving history.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 14. Learner navigation continuity                                                                                            | Optional learner-controlled default Course preference plus one independent route anchor per Course, both versioned and distinct from current focus, completion, evidence, and mastery.                                                                     | Depends on Course/View identity; model-issued writes reuse Gate 8 and the durable Turn source.                                                                                             | One active Course, a global current item, implicit directory/model preference mutation, or mastery inference.                                                                                                                                     | Independent Courses, explicit preference confirmation/correction, request-specific Course use without preference mutation, stale anchors, deleted source transcript, restart, and no false semantic promotion.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 15. Retained scoped steering                                                                                                 | Only learner instructions with a real future sampling consumer become source-linked, scoped, versioned, correctable policy state.                                                                                                                          | Requires durable Turn/source identity, Gate 8 settlement, trusted time where relevant, and a later Context projection consumer.                                                            | A permanent preference database, future-attention authority, a second runtime/mode, or a taxonomy of all Tutor actions.                                                                                                                           | Current-request exception without erasure, expiry without evidence mutation, correction/supersession, restart, exact policy revision, and native-provider qualification that the contribution affects the intended sample.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 16. [Learner Goal authority](../research/opencode-fork-gate-16-learner-goal-authority-2026-07-21.md)                          | Learner-owned intended outcomes persist across Sessions with source, scope, revision, correction, optional attainment conditions and target time, plus explicitly authorized achievement, abandonment, or supersession; Course scope is optional and may span Courses. | Durable learner intent must exist before Context and planning consume it; model-assisted clarification may reuse Turn and Gate 8 without silently promoting conversation into a Goal.      | An OpenCode todo, Codex execution Goal, mandatory Course lifecycle, mastery evidence, goal decomposition, deterministic learning-history taxonomy, static priority, scheduler, score, or automatic attainment.                                       | LearnerHome/Course/multi-Course scope; direct learner initiation and accepted model clarification; ambiguous correction/resumption/decay/raised-standard/new-purpose cases preserve the accepted interpretation and source; target-time passage without lifecycle invention; fresh-Session owner reads without Gate 18 context injection; conflicting reuse; and no completion or identity relation inferred from Tutor prose, Agent execution, time, ability, or evidence.                                                                                                                                                                                      |
| 17. [Natural-language learning bootstrap](../research/opencode-fork-gate-17-natural-language-learning-bootstrap-2026-07-22.md) | A deliberate released-v1 natural-language bootstrap can create or revise only the Course/View state currently needed, can separately admit exact source/material state when the learner adopts it, and can teach immediately. Whether `/learn` is mandatory, optional, or unnecessary remains a Gate-local design question; syntax alone does not authorize a domain write or decide new/continue. Separately authorized Goal, steering, or other domain effects remain governed by their own owners. A model-authored route is visibly provisional by exact provenance, not by a Course lifecycle state. | Needs Course authority, command settlement, durable Turn, and a request-bound creation/effect identity; the material path also uses Artifact and, when needed, Representation and Map/alignment authorities. Any retained `/learn` envelope must preserve verifiable admission across carriers and be discoverable in the primary TUI. | A universal CRUD/command bus, shelling into deterministic CLI mutation, hidden import from read/search/web research, mandatory Goal/LearningSpace, eager whole-route construction, automatic ordinal/progress advancement, or an implicit Session/queue/macro-activity lifecycle. | Fresh LearnerHome traces with and without local material; exact replay/conflict for creation; explicit comparison of one bounded atomic local composition with staged settlement and refreshed context where work is external, cannot be authorized or validated together, or depends on the first result; truthful visible partial settlement when Course commits before material/provider failure; transient web research remains model-proposed without an admitted exact remote Artifact; route revision exposes the exact anchor outcome; immediate explanation/demonstration; correction preserving history/provenance; generic read/search remains zero-write and other domain owners retain their admission rules. Session topology, queue/steer, macro continuation, and detour/rejoin are intentionally left for later derivation. |
| 18. Learning context and Session continuation                                                                                | Every admitted released-v1 interactive Tutor/Agent model operation receives a bounded, immutable, revision-exact projection with lazy detail; fresh/resumed Sessions reuse relevant learning state without importing another Session's transcript. Program-owned internal model operations retain their narrow purpose contracts. | Consumes real material, navigation, steering, Goal, Turn, and policy records; it performs no domain writes and reuses rather than reinterprets any exact steering cut already bound by Gate 15. | A second context database, eager full-state/transcript import, full interactive learning context for internal title/compaction/representation operations, durable summary as truth, a newly invented soft-workspace-memory subsystem, or a new runtime. | Cross-Course request selection, exact policy/authority revisions, preference non-mutation, missing/truncated detail, non-mutating continuation, restart, compaction, fresh Session behavior, and carrier coverage without widening internal-operation authority. |
| 19. First learner-record adaptation                                                                                          | The first experimentally justified source-linked occurrence/evidence/hypothesis distinction is correctable and changes a later Tutor action; valuable zero-write teaching remains legal.                                                                   | Begins only after a bounded later-action collision shows Context cannot recover the needed distinction from existing state.                                                                | A universal activity table, mastery score, mandatory write per interaction, or importing ALS schemas.                                                                                                                                             | Experiment result can shrink or defer the Gate; native evidence then covers report/evidence/inference separation, source/condition attribution, correction, duplicate occurrence, fresh Session adaptation, and zero-write teaching. |
| 20. Source-linked future attention and Tutor return                                                                          | A future-attention concern, its eligibility, conditional current-purpose projection, and eventual truthful service form one vertical loop while remaining distinct facts.                                                                                  | Uses Context, durable Turn, Gate 8, trusted time, retained steering, and exact targets; it does not require learner adaptation.                                                            | A reminder/todo system, universal selector/scheduler, durable active engagement, generic pedagogy enum, correctness, retention, or mastery.                                                                                                       | Due without selection; one legal concern as conditional default; exact current request override; multiple-candidate truthful fallback; source-bound operative constraint where demonstrated; only one complete source-aligned occurrence can serve; failure/interruption/cancellation/restart cannot invent service. |
| 21. Substantial cross-day planning authority                                                                                 | The current Gate candidate admits the independent Assignment identity/revision required by the representative Assignment path unless its experiment returns a split or deferral to the roadmap owner. A typed planning demand then references an exact Goal or Assignment revision; accepted remaining-work/capacity/progress inputs, allocation, infeasibility, learner override, feedback, and recomputation use program-owned arithmetic with source-bearing open judgments. An exact later context or Tutor decision must consume the allocation. | Requires an exact Goal producer or its own exact Assignment producer, accepted workload/capacity inputs, trusted time, Context, and representative multi-day pressure; an Assignment is not required when a Goal supplies the demand. | Minute-scale rescue, model-owned arithmetic, hiding obligation identity inside planning state, merging Goal and Assignment, every task becoming an Assignment, a universal scheduler, or a static priority scalar. | Bounded experiment before contract; the no-Assignment OS-18/DS-20 exam case produces different justified allocations when starting on the 16th versus ten days earlier; independently owned Assignment pressure, corrected estimates/availability, infeasibility, deadline/capacity changes, learner override, progress feedback, restart, and recomputation from accepted inputs hold; at least one changed accepted input produces a changed later Tutor move through the exact consumed allocation. |
| 22. Learning-native TUI inspect/correct                                                                                      | The primary natural-language TUI composes existing domain reads and correction paths so the learner can inspect what was recorded, its source and epistemic status, what it could affect, and which exact context/plan/action has actually consumed it. Diagnostic CLI commands may assist but cannot close this product-surface claim alone. | Follows all first-boundary domain authorities; each still owns its own query and correction semantics.                                                                                     | A second domain owner, a GUI or dedicated full-screen dashboard requirement, a false claim that a stored candidate already changed behavior, routine audit after every explanation, or post-baseline selective deep deletion.                                                                                     | Deterministic TUI inspection of report/evidence/inference, source/revision, potential consequence, and actual or absent consumption; correction/supersession through owning commands; missing-source and stale-state truth; bounded navigation; no mutation from rendering; restart. |
| 23. Integrated Learning-System Product Loop                                                                                  | All retained interactive carriers converge on one released-v1 production model/Turn spine and one Repa product-composition boundary, with no shadow/fallback learning path; this Gate adds no new domain schema. | Requires every still-admitted first-boundary product Gate and TUI projection; an experiment-driven deferral must revise this roadmap before product-boundary acceptance.                    | A single physical input carrier, one universal outcome/activity table, one giant all-feature test, broad release readiness, educational efficacy, a cutover Gate, a second runtime, or post-baseline capabilities.                                                                                                  | At least one connected natural-language causal trace runs from a learning move through learner occurrence/outcome and an owned durable consequence to revised context/plan and a changed later Tutor move. A separate product-floor trace bootstraps and teaches, then uses exact recent Interaction/route state through Gate 18's lazy projection to continue usefully in a fresh Session without eager transcript replay or fabricated progress. A zero-write trace makes learner confusion or correction materially change the next peer teaching move without inventing durable learning state. Orthogonal traces cover future return, Goal- or Assignment-driven cross-day replanning, learner correction, retained-carrier parity, bounded real-provider qualification, cancellation, failure, restart, compaction, and no shadow path. |

The sequence establishes dependency-guided engineering order rather than
claiming that later Gate details are already designed. A Gate may be revised or
the later sequence reordered when its grill exposes contradictory evidence,
but a local implementation shape does not silently rewrite the accepted
skeleton.

Independent nodes may change linear position before their contracts begin when
new dependency evidence warrants it. Gate 11 keeps its accepted number and
representation boundary; the 2026-07-17 additions begin after it.

A required pre-contract experiment may shrink, reorder, or explicitly defer
its candidate Gate. That result revises the accepted first-boundary set before
later contracts proceed; it does not make an absent authority count as closed
or force Gate 23 to prove an obsolete route mechanically.

## Recorded post-baseline capabilities

The following meanings remain recorded rather than prohibited or forgotten.
They do not block Gate 23 and do not receive a numbered Gate until a real
consumer or release promise requires one:

- **Data Lifecycle / selective deep deletion:** cross-authority impact preview,
  explicit learner authorization, atomic removal or supersession, and truthful
  treatment of retained provenance. This is the explicit home for the
  previously vague `later` deep-delete references.
- **Richer agenda-family and policy behavior:** generic commitment, generic
  deferral, durable multi-Turn detour/rejoin, additional steering scopes,
  stable learner defaults, and broader multi-candidate
  task-selection/explanation policies. This deferral does not excuse a
  baseline producer from proving that its claimed behavioral contribution has
  a real consumer.
- **Additional learning structures:** durable LearningSpace, reusable Domain
  Foundation, Course completion/abandonment/enrolment meanings, richer learner
  history/evidence, and long-horizon review algorithms.
- **Material acquisition and retrieval:** mutable remote-source acquisition,
  broader retained raw-source backing, semantic/vector indexing, and larger
  search/ranking systems. Ordinary bounded exact reads remain the baseline.
- **Operations and distribution:** background notifications, Repa-owned
  updater/CI/release channels, additional platform qualification, and any
  future evidence-based OpenCode-v2 comparison.
- **Human outcome research:** educational efficacy and longer-term learner
  outcomes require separate human evidence; engineering Gates do not claim
  them.

Each item retains its named product area and admission trigger. It may later
earn a Gate, experiment, or release condition; absence from the first numbered
route is not a permanent rejection.

## Oracle and reference use

Use the pre-fork oracle for behavioral meanings, counterexamples, correction
semantics, and restart/failure evidence. Do not import its runner, schema,
prompt bytes, or tool APIs.

Use pinned OpenCode and Codex references to understand mature provider,
streaming, cancellation, tool, terminal, and storage mechanisms. Reuse a
mechanism only when the same engineering problem exists in Repa. Reference
package topology does not choose Repa's domain boundaries.

## Product-boundary, release, and cutover meaning

The fork is already the sole active source/runtime lineage. The pre-fork tree
is an immutable oracle, not a second runtime awaiting deletion. Source/runtime
cutover is complete and no new Cutover Gate is planned.

Gate 23 may close when the first planned engineering product boundary and its
integrated learning loop are established. That does not by itself claim broad
release readiness or educational efficacy. Release claims use a separate,
recurring checklist matched to the promised artifact, including applicable
build/package/startup, migration, configuration/permission, supported-platform,
real-provider, failure/recovery, documentation, and—before the first release
candidate—owner-dogfood evidence.

Before Gate 23 closes, perform one proportionate cross-Gate audit of active
production owners and call paths. Check whether two reachable implementations
own the same invariant, a new function or mechanism bypasses an applicable
inherited or earlier-Gate owner, or correction work left a shadow or fallback
path. This is not exhaustive function deduplication or a line-count target;
intentional separation remains valid when ownership, identity, lifecycle,
correction, or failure semantics differ. Findings reopen only the affected
owner and evidence rather than every closed Gate.

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
- Do not turn a recorded post-baseline capability into either a silent baseline
  obligation or a permanent prohibition without revising its owning decision.
- Do not require a structural Gate to impersonate a finished product, and do
  not call an arbitrary partial change a Gate merely because it is small.
- Keep the oracle tag immutable and never dual-run or dual-write the pre-fork
  and fork systems.
