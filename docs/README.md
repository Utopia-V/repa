# Repa documentation

Status: Gates 0–8 are closed. Gate 8 learning-command settlement passed at
implementation commit `293ff6892` after independent top-level reviews accepted
both its contract/theory and implementation/evidence. Gate 9 source and artifact
authority has now passed both review layers after the original reviewer closed
all contract and implementation findings. Its accepted implementation candidate
is present in the working tree, but no integration commit has been authorized;
Gate 9 remains open pending that separately governed step.

## Active Gate map

| Gate                                | Product-level result                                                                                                                              | Current disposition                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0. Oracle freeze                    | Preserved and classified the pre-fork learning product as evidence rather than a runtime dependency.                                              | Closed.                                                                                                                                                                                                                                                                                                            |
| 1. Lineage                          | Established the exact full-history MIT fork of OpenCode `v1.17.18`.                                                                               | Closed.                                                                                                                                                                                                                                                                                                            |
| 2/2A. Windows baseline              | Recorded the inherited Windows failure truthfully, then corrected only its invalid test oracle.                                                   | Closed.                                                                                                                                                                                                                                                                                                            |
| 3. Repa identity                    | Isolated the Repa executable, paths, configuration, environment, and database identity from OpenCode state.                                       | Closed.                                                                                                                                                                                                                                                                                                            |
| 4. Learning-first composition       | Gives legitimate released-v1 model calls one Repa product composition and narrow program-owned internal operations.                               | Closed again. Presentation metadata no longer grants internal authority; admitted Agent-driven calls receive interactive Repa composition, while three trusted call origins own narrow non-tool stream operations. Carrier, recovery, provider, and Session-title concurrency evidence is independently accepted.  |
| 5. Local product surface            | Makes the current terminal product truthful while retaining useful local capabilities and harmless hibernated source.                             | Closed again. Public preview-v2 execution and its runners are absent from production while their implementation remains hibernated; registered provider and credential surfaces use the truthful outward projection; ambient hosted/Desktop CORS grants are gone; the existing updater hibernation remains intact. |
| 6. Native database admission        | Owns Repa database admission, forward migration lineage, and the single state-owner boundary.                                                     | Closed again. Only a recovered zero-page acquisition state may initialize; arbitrary sidecars cannot promote a page-backed identityless database, and dangling final file symlinks refuse before SQLite open.                                                                                                      |
| 7. Course and Course View authority | Adds independent Courses, stable View identities, immutable revisions and mappings, exact working selection, and reversible versioned withdrawal. | Closed. Its contract, schema, migration, implementation, focused evidence, and corrected Gate 6 runtime prerequisite are accepted.                                                                                                                                                                                 |
| 8. Learning-command settlement      | Binds trusted causal and invocation identity to one real Course-owned command.                                                                    | Closed. Its [contract and implementation record](research/opencode-fork-gate-08-learning-command-settlement-2026-07-16.md), migration, settlement substrate, Session lifecycle integration, and focused evidence are independently accepted.                                                                       |
| 9. [Source and artifact authority](research/opencode-fork-gate-09-source-artifact-authority-2026-07-16.md) | Gives logical sources stable identity, exact observed content revisions, location history, availability, and provenance without making them Course-owned. | Contract/theory and implementation/evidence accepted after the original reviewer closed `G9-C01`–`G9-C08`, `G9-E01`–`G9-E04`, and `G9-I01`–`G9-I03`. The working tree is ready for a separately authorized integration commit; Gate 9 remains open until that provenance is fixed. |

Gate numbers record engineering acceptance; they are not a total dependency
chain. Gate 5 now owns the stable reachable model-carrier set that Gate 4 must
audit and the state-owning entrypoint set that Gate 6 must cover. Gate 7 has a hard
dependency on Gate 6's database identity, migration lineage, and one-owner
runtime invariant, not on a particular lock implementation. The latest Gate 6
correction restored that runtime prerequisite without reopening Gate 7's own
contract or implementation.

The database correction now proves initialization from an empty zero-page
acquisition state rather than from sidecar presence and rejects an unresolved
final file symlink before SQLite open. Independently, the product-surface
correction stabilized Gate 5, and Gate 4 has now closed its audit of the final
released-v1 carrier set. The same independent reviewer accepted both the
corrected contract/theory and the implementation/evidence. The result separates
interactive Agent calls from three trusted internal stream purposes, rejects
privileged workflow execution before an internal sample begins, preserves
explicit hidden-Agent admission without exposing it in discovery, and makes
profile-loss and recovered-Session failure behavior explicit. Session title
eligibility and every full-row Session patch now share one per-Session
serialization owner, closing both stale-snapshot overwrite paths. Gate 8 now
binds one trusted interactive model invocation and stable admitted learner
occurrence to an exact Course-owned Revision acceptance. Its shared substrate
separates physical replay from semantic effect identity, settles exact
transaction-first Parts, events, and results, preserves truthful
compaction/fork/deletion lineage, and closes Session lifecycle races without a
second runner. Independent top-level reviews accepted both its contract/theory
and implementation/evidence.

Gate 7 now gives the native LearnerHome database its first learning authority.
Repa can persist several independent Courses; each Course may exist without a
View, retain stable View identities with immutable linear revisions, preserve
Course-owned item identity through a closed preserve/split/merge algebra, and
optionally select one exact eligible Revision. Versioned withdrawal,
restoration, selection, bounded reads, and same-snapshot composite reads
enforce the accepted concurrency and recovery rules. The implementation
remains deliberately below Session, model-command, material, learner-record,
Agenda, context, and terminal integration.

Accepted grill result so far: define the complete logical skeleton across the
major learning authorities before Gate decomposition, while leaving full
physical schemas and local implementation details to the Gates that own them.
Durable learning state also has an independent lifecycle from Session
transcripts: ordinary conversation deletion preserves a minimal causal receipt
and does not cascade into Course, material, learner, Agenda, route, or policy
state.
Model-issued learning writes share a narrow causal-receipt and physical-call
settlement substrate, while every learning authority retains ownership of its
semantic effect identity and state transitions.

The dependency-guided Gate 7–17 decomposition in Roadmap 09 is accepted. Gate 7
implements the accepted Course and View authority. A Course may exist before
any honest Course View is available instead of forcing a placeholder route. A
View is a stable route-strategy identity with immutable revisions, and the
working selection pins one exact eligible revision rather than following new
revisions automatically. Candidate, historical, and working are derived per
Revision rather than stored View lifecycles. Item continuity uses a closed
preserve/split/merge algebra and exact source membership when another View
reuses an item. Ordinary removal is reversible withdrawal; every rejection or
withdrawal that can race with working selection checks the exact target and its
independent version in the same transaction. Gate 7 records only
application-bound authorship basis. Gate 8 adds a durable causal receipt for one
exact non-null acceptance command without changing that creation provenance.
Non-null withdrawal replacements satisfy the same target-version checks as
ordinary selection, closing the remaining ABA path. Collection reads are
cursor-bounded and stably ordered, and multi-query domain reads observe one
database snapshot rather than assembling impossible mixed states.

This file is the sole owner of volatile active-work status. `AGENTS.md` and the
roadmap contain stable policy and links rather than copied “next task” state.

This directory is the normative documentation spine carried into the production
fork. It deliberately excludes the old runtime, bulk research narrative, and
legacy labs.

## Product and architecture

- [Product origin](foundation/00-product-origin.md)
- [System architecture](architecture/00-system-architecture.md)
- [Native learning data model](architecture/01-native-learning-data-model.md)
- [One-time fork roadmap](roadmap/09-one-time-opencode-fork-baseline.md)
- [Fork provenance and gate ledger](fork-ledger.md)
- [Gate 4 learning-first composition record](research/opencode-fork-gate-04-learning-first-composition-2026-07-14.md)
- [Gate 5 terminal-only surface record](research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md)
- [Gate 6 native database-admission record](research/opencode-fork-gate-06-native-database-admission-2026-07-14.md)
- [Passed Gate 7 Course and Course View authority record](research/opencode-fork-gate-07-course-view-authority-2026-07-15.md)
- [Passed Gate 8 learning-command settlement record](research/opencode-fork-gate-08-learning-command-settlement-2026-07-16.md)
- [Active Gate 9 source and artifact authority record](research/opencode-fork-gate-09-source-artifact-authority-2026-07-16.md)
- [Pre-fork asset disposition](research/pre-fork-repa-asset-audit-2026-07-13.md)

## Accepted decisions

- [ADR-0002: modes are policy profiles](decisions/0002-modes-are-policy-profiles.md)
- [ADR-0003: learning state follows evidence](decisions/0003-learning-state-follows-evidence.md)
- [ADR-0004: Codex is a secondary reference](decisions/0004-codex-secondary-reference.md)
- [ADR-0005: durable Turn and Interaction hierarchy](decisions/0005-durable-turn-and-interaction-hierarchy.md)
- [ADR-0006: atomic local learning transaction](decisions/0006-atomic-local-learning-transaction.md)
- [ADR-0007: process-local coordination and finite Turns](decisions/0007-process-local-coordination-and-finite-turns.md)
- [ADR-0008: model write initiative and durable authority](decisions/0008-model-write-initiative-and-durable-authority.md)
- [ADR-0009: invocation and semantic-effect identity](decisions/0009-separate-invocation-and-semantic-effect-identity.md)
- [ADR-0010: scoped learner steering is policy state](decisions/0010-scoped-learner-steering-is-policy-state.md)
- [ADR-0012: learning-centered modular monolith](decisions/0012-learning-centered-modular-monolith.md)
- [ADR-0013: conditional current-purpose composition](decisions/0013-conditional-current-purpose-composition.md)
- [ADR-0014: one-time OpenCode fork](decisions/0014-one-time-opencode-fork.md)

Superseded ADRs 0001 and 0011 remain in the historical oracle and are not active
instructions.

## Historical oracle

The immutable Git tag `repa-prefork-oracle` points to the final pre-fork
decision record. Read historical evidence without copying it into production:

```powershell
git show repa-prefork-oracle:docs/research/<record>.md
```

The tag is evidence, not a runtime dependency. Do not import old source, invoke
it as a fallback, dual-write its database, or preserve it behind compatibility
adapters.
