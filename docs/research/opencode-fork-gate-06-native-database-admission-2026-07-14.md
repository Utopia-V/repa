# OpenCode fork Gate 6: native database admission

Status: Pre-contract evidence — maintainer `grill-me` required before Gate 6 begins

Date: 2026-07-14

Parent plan: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Decisions: [ADR-0012](../decisions/0012-learning-centered-modular-monolith.md)
and [ADR-0014](../decisions/0014-one-time-opencode-fork.md)

This record preserves the evidence and decision boundary for the pre-Gate-6
conversation. It is not an accepted Gate contract and authorizes no production
change.

## Why Gate 6 is a real candidate

The current database path is Repa-owned, but database admission is still
inherited behavior:

- `packages/core/src/database/migration.ts` treats any database containing a
  `session` table as an existing installation and applies the inherited
  migration chain;
- the same module imports an inherited `__drizzle_migrations` journal when its
  own journal is empty;
- database initialization converts migration/admission failures into defects
  through `Effect.orDie`; and
- the migration and connection semaphores are process-local. No current owner
  establishes the accepted one-state-changing-process-per-LearnerHome rule
  across processes.

Consequently, a renamed file path alone cannot distinguish a current Repa
database from OpenCode, pre-fork Repa, future, partial, arbitrary, or corrupt
SQLite state before mutation.

## Already settled

- Repa has one native SQLite authority for one LearnerHome.
- There is no OpenCode or pre-fork Repa data-compatibility promise.
- The inherited Session/message/part schema may form part of Repa's initial
  physical baseline; it does not retain OpenCode migration authority merely
  because its tables exist.
- Gate 6 does not add learning authorities, map Interaction meaning, introduce
  a second database, or build a general database-management framework.
- Pre-Gate-6 development data has no migration promise and may be discarded
  after rollback or a deliberately accepted clean-baseline change.

## Questions reserved for the grill

The maintainer conversation must settle only choices that materially affect
the product boundary, including:

1. What should a second Repa process experience while another process owns
   state-changing LearnerHome execution: a clear refusal, an attach path, or a
   bounded read-only mode?
2. When the configured database path contains foreign, future, partial, or
   corrupt state, should the baseline stop non-destructively and require an
   explicit recovery/reset action, or may it quarantine the file and create a
   fresh database automatically?
3. Should the first Repa-native baseline sever the inherited migration journal
   completely, or retain any part of it solely as an internal bootstrap record?
   The current recommendation is a clean Repa-owned identity and forward
   lineage with no implicit OpenCode-journal import.

The grill may replace this framing. Its accepted answers must be written back
before a Gate contract or implementation plan is locked.

## Candidate evidence boundary, not yet accepted

A plausible Gate would prove that admission observes identity and version
before mutation; initializes a fresh database atomically; advances only a
recognized Repa lineage; rejects foreign, future, partial, and corrupt files
truthfully; preserves the accepted file on rejection; and enforces the chosen
single-writer behavior across real processes. Ordinary Session persistence and
restart must remain intact.

Tests should target those admissions, crash boundaries, and two-process
behavior. No monorepo-wide test or unrelated learning feature belongs to this
evidence claim.
