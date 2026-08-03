# Representation producer adapters

The accepted Gate 11 contract assigns `packages/opencode` the closed outer
producer ports described by
[Gate 11](../../../../docs/research/opencode-fork-gate-11-readable-representation-lineage-2026-07-17.md).
Core remains the Representation identity, lineage, storage-acceptance, and
current-use authority. This subtree is one recorded adapter location, not
evidence that the current package split or composition is automatically valid.

## Required adapter boundary

Gate 11 assigns the fixed PDF.js framed child-process producer and its
conversion-side adapter here, including bounded input/output, diagnostics,
cancellation, and truthful producer results. Its accepted implementation
record locates the configured-model producer and Gate 8 binding at
`../learning-command/representation-runtime.ts`; audit both locations as one
closed two-producer port without sharing domain ownership. That recorded path
does not make a newly observed cross-owner dependency acceptable. External
conversion completes before the short Core acceptance transaction. A producer
never receives a canonical output path or writes authority rows directly;
publication and database failure must leave no false accepted availability.

Do not turn these two consumers into a dynamic converter registry, plugin
host, job queue, OCR platform, summary/note generator, Material Map, retrieval
index, or RAG subsystem. Never fall back to another producer under the same
operation identity, and never treat nonempty text or zero warnings as proof of
fidelity.

Focused checks from `packages/opencode`: `bun test
test/representation/conversion.test.ts test/representation/pdf-producer.test.ts
test/learning-command/representation-runtime.test.ts`; run the matching Core
Representation profile/authority tests when the port changes.
