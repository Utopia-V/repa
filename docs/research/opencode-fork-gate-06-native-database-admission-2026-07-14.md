# OpenCode fork Gate 6: native database admission

Status: Contract accepted — implementation in progress

Date: 2026-07-14

Parent plan: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Decisions: [ADR-0012](../decisions/0012-learning-centered-modular-monolith.md)
and [ADR-0014](../decisions/0014-one-time-opencode-fork.md)

This record owns the Gate 6 contract. It preserves the maintainer decisions,
the source evidence that constrains their implementation, and the evidence
that will close the Gate. The contract authorizes only the production changes
named below.

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

The pinned source distinguishes storage concurrency from live-runtime
ownership. Released-v1 ordinary TUI launches create separate workers against
the shared SQLite path; WAL serializes database writes, but Session run state,
status, cancellation, and live event delivery remain process-local. The v1
`serve` plus `attach` path can centralize that state explicitly. Preview v2
instead makes a registered server the default client transport, but it is not
the accepted runtime baseline and still lacks required parity recorded in
ADR-0014.

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
- One state-owning Repa server or worker holds the LearnerHome writer lease.
  A second ordinary state-owning launch refuses clearly; an explicit client
  attached to the owner is not a second writer. The baseline adds neither a
  read-only second database opener nor an automatic daemon.
- The lease is a narrow runtime-admission boundary with abrupt-exit and stale-
  owner recovery. It must not embed the v1 TUI worker shape into database,
  migration, or learning-domain APIs.
- A released, parity-complete OpenCode v2 is a future comparison trigger, not
  an upgrade promise. Repa will compare its then-current product with the
  proven upstream mechanisms and may adopt them selectively.
- A foreign, unsupported-old, future, partially migrated, or corrupt database
  causes a non-destructive startup refusal before mutation. Repa preserves the
  configured file and requires an explicit recovery or reset action; it does
  not automatically quarantine the file and create an apparently empty
  LearnerHome. This rare path does not justify a general repair framework.
- The first accepted database is initialized from the complete current schema
  as one Repa-owned baseline. Runtime admission does not import
  `__drizzle_migrations` or treat inherited migration IDs as Repa history;
  only migrations created after that baseline enter the forward registry.
  Inherited migration source may remain as historical implementation evidence
  without runtime authority.

## Grill conclusion

The maintainer grill settled process ownership and invalid-database behavior.
The remaining lineage question is determined by the accepted no-compatibility
boundary and the current implementation evidence:

- `packages/core/src/database/migration.ts` imports `__drizzle_migrations` only
  to keep an existing OpenCode installation from replaying prior migrations;
- the corresponding tests in
  `packages/core/test/database-migration.test.ts` protect that compatibility;
- Repa rejects those databases and has no pre-Gate-6 data migration promise;
  therefore importing or registering the inherited journal supplies no Repa
  behavior and would weaken admission identity.

The Gate contract replaces those compatibility claims with Repa baseline,
foreign-database rejection, and forward-migration evidence.

## Accepted implementation boundary

Gate 6 establishes three connected boundaries and no fourth subsystem:

1. **Database admission.** Repa observes whether the configured database path
   existed before opening it. A fresh path is initialized as the complete
   current schema in one transaction and receives a stable Repa application
   identity, a baseline schema version, and exactly one Repa baseline journal
   entry. An existing path is classified before Repa changes journal mode,
   checkpoints WAL, creates tables, or writes a migration row.
2. **Forward lineage.** The runtime registry contains only migrations authored
   after the Repa baseline. An existing Repa database is admitted only when its
   application identity, schema version, and ordered journal form an exact
   prefix of that registry. A recognized suffix advances one transaction at a
   time; the schema change, journal row, and version advance commit or roll back
   together. Inherited migration files may remain testable historical source,
   but the generator and runtime registry no longer discover them.
3. **Runtime ownership.** A process acquires the LearnerHome state-owner lease
   before it materializes local AppRuntime, HTTP state, or the database. The
   lease key follows the configured native database authority, never cwd,
   Session, Course, port, or TUI worker identity. The current worker and
   command entry points use this boundary; an explicit attach client bypasses
   local state materialization entirely. The lease is released on orderly
   shutdown and uses the already proven heartbeat/stale-owner mechanism after
   abrupt death.

The lease does not become a database dependency and does not encode the v1 TUI
shape. A later proven server transport can acquire the same ownership boundary
and turn a refused second launch into explicit attachment without changing
database or learning-domain APIs.

Admission runs SQLite's full integrity check and foreign-key check. In this
Gate, “partial” means a state Repa can produce or recognize at its transaction
boundary: identity, version, journal, or required baseline objects disagree.
Gate 6 does not build a generalized schema-forensics manifest for arbitrary
manual tampering. The atomic baseline and per-migration transactions prevent
Repa itself from producing a committed half-schema.

## Failure behavior

- A busy LearnerHome fails before local AppRuntime or SQLite initialization.
  The message identifies the configured home/database and points an intentional
  server user to explicit `repa attach`; it does not wait five minutes or start
  a second read-only runtime.
- A foreign, unsupported-old, future, partial, or corrupt database fails with a
  typed admission reason. Repa leaves the configured path in place and names
  it so the learner can move, inspect, or remove it deliberately.
- Permission, lock-infrastructure, and unrelated I/O failures remain distinct
  from “another owner” and from database corruption.
- Failed fresh initialization or forward migration cannot publish a Repa
  identity/version/journal advance without the corresponding schema state.
- Normal shutdown releases immediately. Forced termination may require the
  existing bounded stale-owner recovery interval; Gate 6 does not add a daemon,
  PID supervisor, or repair service for this rare path.

## Explicit non-goals

- no OpenCode, pre-fork Repa, or pre-Gate-6 development-data migration;
- no automatic quarantine, replacement database, recovery wizard, backup
  manager, or raw-SQL compatibility promise;
- no preview-v2 daemon, discovery protocol, dual runtime, or future adapter;
- no learning tables, Interaction mapping, content-root authority, or new
  teaching behavior;
- no generated framework for detecting every possible manual SQLite schema
  alteration; and
- no monorepo-wide verification merely because the boundary crosses entry
  points.

## Implementation ownership

- `packages/core/src/database/` owns identity constants, admission checks,
  atomic baseline/forward migration, and the runtime registry.
- `packages/core/script/migration.ts` owns the separation between retained
  inherited migration source and newly generated Repa migrations.
- the existing filesystem-lock primitive owns atomic lock directories,
  heartbeat, token-safe release, and stale recovery; Gate 6 adds only the
  immediate-acquire/release surface required by a process owner.
- a narrow OpenCode-side LearnerHome ownership module owns process acquisition
  and user-facing busy errors. CLI/TUI/server entry points only decide whether
  they are a state owner or a pure attached client.
- existing error formatting owns actionable database and ownership messages.

## Closing evidence

Evidence must be capable of directly falsifying the boundary:

- a missing path creates one complete Repa baseline with no inherited runtime
  migration IDs, then reopens with ordinary Session state intact;
- OpenCode-shaped, unknown/future, inconsistent-lineage, failed-integrity, and
  foreign-key-invalid databases refuse before Repa mutation and remain at the
  configured path;
- an injected forward migration failure leaves schema, version, journal, and
  prior rows at the previous recognized state;
- two real processes show immediate second-owner refusal, immediate reuse after
  orderly release, and stale recovery through the existing lock primitive;
- full attach, mini attach, and `run --attach` remain clients while an owner is
  active and do not create or migrate the client's local database; and
- the focused migration generator check and affected package typechecks pass.

Tests should target those admissions, crash boundaries, and two-process
behavior. No monorepo-wide test or unrelated learning feature belongs to this
evidence claim.
