# Natural-language learning bootstrap composition

This Repa-added subtree is one current implementation location for the
application composition seam governed by
[Gate 17](../../../../docs/research/repa-gate-17-natural-language-learning-bootstrap-2026-07-22.md).
Gate 17 explicitly leaves exact module placement as an implementation detail.
Keeping code here does not validate that placement or create another durable
authority; any retained code must satisfy the owner and dependency rules below.

## Required boundary

Compose one request-bound Course/View/material/selection/anchor change set
through the existing Course, Artifact, Representation, Material Map,
navigation, learning-command, and Turn boundaries. The application may prepare
inputs and open the final transaction; every owner validates and applies its
own invariant through a narrow transaction-scoped seam. Standalone and
composite paths share those owner functions—composition code never writes
owner tables directly or duplicates their legality.

The ordinary released-v1 Agent performs open-language interpretation and may
teach in the same Turn. Useful teaching does not require a durable write.
There is no built-in `/learn`, second parser/selector/model call, mandatory
Course/View/material creation, implicit default-Course or progress mutation,
raw-path authority, hidden admission from generic reads, or more than one new
Artifact mutation in one admitted model operation. Separately committed
external preparation remains visibly partial if the final composition fails.

Focused check: `bun test test/learning-bootstrap.test.ts` from `packages/core`.
Registry, permission, settlement, presentation, carrier, or migration changes
also require the exact affected `packages/opencode` and `packages/tui` Gate 17
evidence paths.
