# Source and Artifact authority

Changes in this subtree must preserve the source/Artifact contract recorded by
[Gate 9](../../../../docs/research/opencode-fork-gate-09-source-artifact-authority-2026-07-16.md).
Use the [native learning data model](../../../../docs/architecture/01-native-learning-data-model.md)
for its relation to Representation and Material Map.

## Required boundary

Own stable Artifact identity, at most one active source location, exact
observed Revisions, append-only observation/location history, source-lineage
and attribution correction, disposition, availability, and bounded reads.
Corrections preserve old observations and references; digest equality, path
similarity, or model prose never merges independently admitted ancestry.

Artifact does not own filesystem authorization or traversal, ContentRoot,
conversion/storage producers, Representation, Material Map, Course, learner
state, or Session settlement. Accept trusted canonical locations and exact
observations from the outer source boundary rather than importing filesystem
or permission services. Missing source, resolvable retained backing,
withdrawal, retained bytes, and deletion of the learner's file remain distinct
facts and operations.

Focused check: `bun test test/artifact-authority.test.ts` from `packages/core`;
include migration and consuming source tests when public contracts change.
