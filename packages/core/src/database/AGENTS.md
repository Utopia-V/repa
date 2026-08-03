# LearnerHome database composition

Changes in this subtree are governed by the accepted Repa database contract
recorded by
[Gate 6](../../../../docs/research/opencode-fork-gate-06-native-database-admission-2026-07-14.md).
The [system architecture](../../../../docs/architecture/00-system-architecture.md)
owns persistence and process semantics; the Gate record owns the concrete
admission and recovery contract.

This is a mixed-lineage directory: inherited database primitives and
preview-v2 migrations coexist with Repa admission, authority, schema
composition, and `migration/repa`. Gate 6 governs the admitted Repa production
path; it does not
retroactively make every inherited helper or migration a Repa authority.
Classify each dependency and registry edge against that path before preserving
or extending it.

## Required boundary

- Own Repa database identity, physical target admission, one state-owning
  connection, forward-migration ordering, schema generation, and truthful
  refusal/recovery results.
- Keep `repa.db` as the sole Repa application-state database for one
  LearnerHome. A Session, directory, Course, or inherited database is not
  another state root.
- `migration/repa/` contains the only runtime Repa forward lineage. Sibling
  timestamped OpenCode migrations are retained source history, not registry
  entries or compatibility input.
- Domain modules own the meaning and validation of their schema changes;
  database composition owns ordered atomic execution, not their semantics.

## Maintenance rules

Reject foreign, unsupported-old/future, partially migrated, corrupt,
hardlinked, or concurrently owned targets before application mutation. Do not
silently quarantine, reset, import, or infer an OpenCode database. Existing
behavior-changing constraints and triggers change only through a versioned
migration tested from the frozen predecessor fixture; never reinstall current
helpers into an old migration.

Focused checks start with `bun test test/database-authority.test.ts
test/database-migration.test.ts` from `packages/core`. Runtime admission changes
also require the affected `packages/opencode/test/cli/database-admission.test.ts`
cases.
