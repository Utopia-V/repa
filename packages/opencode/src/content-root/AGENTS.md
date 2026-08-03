# ContentRoot host adapter

Changes in this Repa-added subtree must satisfy the released-v1 application
adapter contract for the
[ContentRoot boundary](../../../../docs/research/opencode-fork-gate-10-content-root-authority-2026-07-17.md).
The Core ContentRoot and Artifact modules remain the durable owners. Current
file placement or traversal behavior must be checked against that contract;
it cannot redefine it.

## Required adapter boundary

Prepare bounded manifests and exact observations through authorized root
reads, expose truthful truncation/failure, and commit selected files through
the Gate 9 authority. Do not make directory discovery, a path string, root
approval, generic reads, or model interest into Artifact, Course,
LearningSpace, classification, or batch authority. A deterministic multi-file
manifest applies members independently; it is not a durable batch coordinator
or one model-visible multi-mutation command.

Keep traversal, permission/cancellation integration, and host preparation
outside Core domain semantics. Never bypass stable path-object verification or
the Artifact owner's exact preconditions with raw filesystem access.

Focused checks from `packages/opencode`: `bun test
test/content-root/manifest.test.ts test/tool/content-root.test.ts`; add the
Core authority test when the trusted port changes.
