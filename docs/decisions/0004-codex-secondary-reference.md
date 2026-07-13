# ADR-0004: Use Codex as a pinned secondary reference

Status: Accepted
Date: 2026-07-10

## Context

OpenCode is the project's primary executable reference, but relying on one
implementation creates a different form of blank-page risk: an upstream product
choice can be mistaken for a general agent-harness invariant.

Codex is an independently developed, open-source terminal agent with explicit
thread, turn, item, tool, approval, persistence, interruption, and app-server
protocols. Studying the same runtime problems in both projects makes it possible
to distinguish convergent mechanisms from implementation-specific structure.

## Decision

Codex release `rust-v0.144.1` at commit
`44918ea10c0f99151c6710411b4322c2f5c96bea` is kept as a local, ignored,
read-only checkout under `.reference/codex`.

Codex is a secondary comparison reference. OpenCode remains the primary
reference for the TypeScript/Bun implementation environment. Codex may be used
to challenge or corroborate runtime contracts, especially:

- the distinction between a conversation, a user-visible turn, a provider
  sampling step, and a typed item;
- tool execution, approval, cancellation, and sandbox boundaries;
- persistence, resumption, steering, compaction, and diagnostic tracing;
- finite rollout budgets and continuation control; and
- the separation between internal runtime events and product-facing protocol
  objects.

Production code must not import Codex. This decision does not adopt Rust, fork
Codex, reproduce its app-server protocol, or treat its current behavior as a
normative specification. Adapted mechanisms must record the source, preserved
invariant, and deliberate differences. Substantial copied source must satisfy
Apache-2.0 license obligations; behavior-oriented reimplementation is
preferred.

## Consequences

- Claims described as agent-harness patterns can be checked against at least
  two independent implementations.
- Codex can invalidate an over-strong local guarantee as usefully as it can
  suggest a mechanism.
- Product-scale Rust crate boundaries, compatibility layers, server APIs, and
  coding-specific objects are not architectural templates for Repa.
- Updating the reference requires an explicit `references.lock.json` change
  and a renewed source review.
- A source finding remains informative until a Repa-specific decision promotes
  it into an ADR or accepted proposal.
