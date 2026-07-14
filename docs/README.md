# Repa documentation

Status: Fork Gates 0–5 closed. No next Gate has been selected.

This file is the sole owner of volatile active-Gate status. `AGENTS.md` and the
roadmap contain stable policy and links rather than copied “next Gate” state.

This directory is the normative documentation spine carried into the production
fork. It deliberately excludes the old runtime, bulk research narrative, and
legacy labs.

## Product and architecture

- [Product origin](foundation/00-product-origin.md)
- [System architecture](architecture/00-system-architecture.md)
- [One-time fork roadmap](roadmap/09-one-time-opencode-fork-baseline.md)
- [Fork provenance and gate ledger](fork-ledger.md)
- [Gate 5 terminal-only surface record](research/opencode-fork-gate-05-terminal-only-surface-disposition-2026-07-14.md)
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
