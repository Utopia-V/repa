# Readable Representation authority

Changes in this subtree must preserve the immutable readable-derivation
contract recorded by
[Gate 11](../../../../docs/research/opencode-fork-gate-11-readable-representation-lineage-2026-07-17.md).

## Required boundary

Own Representation identity and revision, exact source-Revision and producer
lineage, profile/provenance, canonical managed-storage identity, availability
history, continued-old-version grants, and distinct current-use versus
historical reads. Artifact remains the sole owner of source identity,
Revision, attribution, and source availability; ContentRoot remains the source
read authority.

A Representation is an optional access rendition—not a note, summary, second
source, preferred/latest pointer, Material Map, retrieval index, or RAG
subsystem. Source drift makes the old derivation stale; it never rewrites,
deletes, retargets, or automatically regenerates it. Core owns no provider,
PDF process, terminal, or plugin registry; the outer application supplies the
closed producer ports and accepts results through this authority.

Start focused checks with the `test/representation-*` and
`test/representation/` files plus
`test/learning-command-representation-settlement.test.ts` from `packages/core`.
Add outer producer tests when a port or profile crosses the package boundary.
