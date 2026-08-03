# Material Map and alignment authority

Changes in this subtree must preserve the material-structure contract recorded
by
[Gate 13](../../../../docs/research/opencode-fork-gate-13-material-map-alignment-2026-07-19.md).

## Required boundary

Own exact Artifact-or-Representation targets, immutable Material Map snapshots,
closed selector algebra, outline identity, neutral many-to-many alignment to
exact Course/View/Revision/item membership, lifecycle, CAS, and bounded reads.
Several Maps may coexist for one target; there is no canonical, working,
preferred, or automatically selected Map.

Material order is not Course order, and alignment does not imply `teaches`,
`requires`, prerequisite, completeness, progress, or evidence. Depend only on
native database plus narrow Course, Artifact, and Representation domain
contracts. Exact Artifact preparation that needs ContentRoot access belongs
to a cross-authority application capability, not this owner. Do not import
providers, runners, terminal code, generic tools, storage internals, search
indexes, or embeddings.
Current-use reads fail closed on exact source/representation/map/Course drift;
they never retarget historical selectors.

Focused checks: `bun test test/material-map-authority.test.ts
test/material-map-migration.test.ts test/material-map-ownership.test.ts` from
`packages/core`.
