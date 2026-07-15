# Repa documentation

Status: Gates 0–3 and Gate 7 are closed. Gates 4–6 are open only for the
bounded corrections below. Gate 8 is paused until those corrections close and
then requires its own grill before a contract or implementation begins.

## Active Gate map

| Gate                                | Product-level result                                                                                                                              | Current disposition                                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Oracle freeze                    | Preserved and classified the pre-fork learning product as evidence rather than a runtime dependency.                                              | Closed.                                                                                                                                                                                                                       |
| 1. Lineage                          | Established the exact full-history MIT fork of OpenCode `v1.17.18`.                                                                               | Closed.                                                                                                                                                                                                                       |
| 2/2A. Windows baseline              | Recorded the inherited Windows failure truthfully, then corrected only its invalid test oracle.                                                   | Closed.                                                                                                                                                                                                                       |
| 3. Repa identity                    | Isolated the Repa executable, paths, configuration, environment, and database identity from OpenCode state.                                       | Closed.                                                                                                                                                                                                                       |
| 4. Learning-first composition       | Gives legitimate released-v1 model calls one Repa product composition and narrow program-owned internal operations.                               | Bounded correction: `hidden` must cease acting as internal-call authority. The final carrier matrix follows Gate 5 reachability repair.                                                                                       |
| 5. Local product surface            | Makes the current terminal product truthful while retaining useful local capabilities and harmless hibernated source.                             | Bounded correction: disconnect public v2 prompt admission and the model execution it schedules, remove remaining provider-name privileges and commercial CLI presentation, and remove the inherited `opencode.ai` CORS grant. |
| 6. Native database admission        | Owns Repa database admission, forward migration lineage, and the single state-owner boundary.                                                     | Bounded correction: arbitrary sidecars must not authorize initialization of a clean identityless database, and a dangling final file symlink must refuse before SQLite can split the main-file and WAL identities.            |
| 7. Course and Course View authority | Adds independent Courses, stable View identities, immutable revisions and mappings, exact working selection, and reversible versioned withdrawal. | Closed. Its contract, schema, migration, implementation, and focused evidence remain accepted; production consumption waits for Gate 6 to restore its runtime prerequisite.                                                   |
| 8. Learning-command settlement      | Will bind trusted causal and invocation identity to one real Course-owned command.                                                                | Not begun; paused behind Gates 4–6.                                                                                                                                                                                           |

Gate numbers record engineering acceptance; they are not a total dependency
chain. Gate 5 owns the reachable model-carrier set that Gate 4 must audit and
the state-owning entrypoint set that Gate 6 must cover. Gate 7 has a hard
dependency on Gate 6's database identity, migration lineage, and one-owner
runtime invariant, not on a particular lock implementation. The latest Gate 6
audit invalidated that runtime completion claim without reopening Gate 7's own
contract or implementation.

The database correction now proves initialization from an empty acquisition
state rather than from sidecar presence and rejects an unresolved final file
symlink before SQLite open. Independently, the product-surface correction
stabilizes Gate 5 before Gate 4 audits the final carrier set. Only after Gates
4–6 close does Gate 8 return to grill.

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
application-bound authorship basis; causal learner/model proof remains Gate 8.
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
- [Accepted Gate 7 Course and Course View authority contract](research/opencode-fork-gate-07-course-view-authority-2026-07-15.md)
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
