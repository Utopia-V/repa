# OpenCode fork Gate 6: native database admission

Historical result: Passed at fork implementation commit `6c0b7aa5b`. Current
disposition is owned by [the documentation index](../README.md).

Date: 2026-07-14

Parent plan: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Decisions: [ADR-0012](../decisions/0012-learning-centered-modular-monolith.md)
and [ADR-0014](../decisions/0014-one-time-opencode-fork.md)

This record owns the Gate 6 contract. It preserves the maintainer decisions,
the source evidence that constrains their implementation, and the evidence
that will close the Gate. The contract authorizes only the production changes
named below.

## Post-close audit correction

The 2026-07-15 post-Gate-7 audit preserved database admission, forward
migration lineage, and their evidence, but reopened the runtime-ownership
claim. The implementation derives a key from `path.resolve()` plus Windows
case folding and places its hash below the process-selected state root. Real
two-process probes therefore admitted two owners for one physical database
through junctions, file symlinks, hardlinks, 8.3/long paths, DOS/extended paths,
and different `XDG_STATE_HOME` roots.

The repair must settle two connected invariants before changing production
code:

1. **Physical authority identity:** aliases that reach one SQLite authority
   cannot acquire independent ownership; unsafe hardlink aliases are rejected
   rather than normalized into journal/WAL ambiguity.
2. **Rendezvous location:** processes targeting that authority compete at one
   lock independently of configurable application-state roots.

The authority admitted by the lease must also be the authority SQLite actually
opens, without a path-substitution window between identity, acquisition, and
open. This requires a Gate 6 design grill against mature OS/file-object and
SQLite locking mechanisms; a `realpath`-only or file-ID-only patch is not an
accepted repair. The runtime correction remains outside database migration and
learning-domain APIs.

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
- One state-owning Repa server or worker holds exclusive authority over the
  LearnerHome database. A second ordinary state-owning launch refuses clearly;
  an explicit client attached to the owner is not a second writer. The baseline
  adds neither a read-only second database opener nor an automatic daemon.
- Ownership is a narrow runtime-admission boundary with bounded abrupt-exit
  recovery. Its mechanism must not embed the v1 TUI worker shape into migration
  or learning-domain APIs.
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

The original maintainer grill settled the product behavior—one state owner,
clear refusal, explicit attach clients, and non-destructive invalid-database
handling—but did not settle physical authority identity or a universal
rendezvous. The no-compatibility boundary and implementation evidence did
settle the independent lineage question:

- `packages/core/src/database/migration.ts` imports `__drizzle_migrations` only
  to keep an existing OpenCode installation from replaying prior migrations;
- the corresponding tests in
  `packages/core/test/database-migration.test.ts` protect that compatibility;
- Repa rejects those databases and has no pre-Gate-6 data migration promise;
  therefore importing or registering the inherited journal supplies no Repa
  behavior and would weaken admission identity.

The Gate contract replaces those compatibility claims with Repa baseline,
foreign-database rejection, and forward-migration evidence. The post-close
audit requires a new local grill to choose the runtime-ownership mechanism
without reopening that lineage decision.

## Accepted implementation boundary

Gate 6 establishes three connected boundaries and no fourth subsystem:

1. **Database admission.** Through the verified authority boundary, Repa
   determines whether the target database exists before SQLite opens it. A
   missing authority is claimed and initialized as the complete current schema
   in one transaction, with a stable Repa application identity, a baseline
   schema version, and exactly one Repa baseline journal entry. An existing
   authority is classified before Repa changes journal mode, checkpoints WAL,
   creates tables, or writes a migration row.
2. **Forward lineage.** The runtime registry contains only migrations authored
   after the Repa baseline. An existing Repa database is admitted only when its
   application identity, schema version, and ordered journal form an exact
   prefix of that registry. A recognized suffix advances one transaction at a
   time; the schema change, journal row, and version advance commit or roll back
   together. Inherited migration files may remain testable historical source,
   but the generator and runtime registry no longer discover them.
3. **Runtime ownership.** Before materializing local AppRuntime, HTTP state, or
   SQLite, a process obtains exclusive ownership of the physical LearnerHome
   database authority. Existing aliases to one database converge; contenders
   with different application-state roots still rendezvous; and unsafe
   hardlink aliases refuse before SQLite opens. For a missing database, aliases
   of its parent and concurrent creators converge on one creation authority.
   The verified authority that wins ownership is also what SQLite opens, so a
   rename, retarget, or path substitution cannot move the connection to an
   unowned object. The current worker and command entry points use this
   boundary; an explicit attach client bypasses local state materialization
   entirely. Orderly exit releases ownership, and abrupt exit recovers according
   to the selected mature mechanism without breaking a live owner.

The verified authority result is consumed only by runtime composition and the
database opener; its identity and lock mechanics do not enter migration or
learning-domain APIs and do not encode the v1 TUI shape. A later proven server
transport can acquire the same ownership boundary and turn a refused second
launch into explicit attachment without changing those APIs.

Admission runs SQLite's full integrity check and foreign-key check. In this
Gate, “partial” means a state Repa can produce or recognize at its transaction
boundary: identity, version, or journal disagree, including a missing Repa
journal. Gate 6 does not build a generalized schema-forensics manifest for
arbitrary manual table changes. The atomic baseline and per-migration
transactions prevent Repa itself from producing a committed half-schema.

## Failure behavior

- A busy LearnerHome fails before local AppRuntime or any SQLite open.
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
- Normal shutdown releases immediately. Forced termination recovers within the
  bounded behavior of the selected mature ownership mechanism without breaking
  a live owner; Gate 6 does not add a daemon, PID supervisor, or repair service
  for this rare path.

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
- a narrow LearnerHome authority boundary owns physical database
  identification, hardlink policy, cross-process rendezvous, acquisition,
  release, and user-facing busy errors. The exact OS/file-object or lock
  mechanism is chosen by the Gate 6 grill; the current filesystem-lock
  primitive has no contractual right to survive.
- ownership admission and the database opener share one verified authority
  result. The SQLite connection must open that admitted authority rather than
  resolving the configured path again after acquisition. This binding remains
  below migration and learning-domain APIs.
- the rendezvous location is derived from the physical authority or another
  process-global facility, never from a caller-selectable application-state
  root. A hardlink alias is rejected before SQLite creates a journal or WAL.
- CLI/TUI/server entry points decide only whether they are a state owner or a
  pure attached client; they do not implement path identity or locking policy.
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
- two real owner processes targeting one existing database through the ordinary
  path, a directory junction, a file symlink, 8.3/long spelling, and
  DOS/extended spelling meet at one authority and refuse the second before it
  opens SQLite;
- the same existing database reached with different `XDG_STATE_HOME` values
  still has one rendezvous, while a hardlink alias is rejected before journal
  or WAL creation;
- two processes racing to create one missing database through aliased parent
  paths and different state roots publish exactly one initialized baseline;
  the loser neither opens nor mutates another database;
- a controlled replacement or retargeting between authority discovery and
  SQLite open fails closed, proving that the ownership claim and opened
  database name the same authority rather than two observations of a mutable
  path;
- the chosen mechanism shows immediate reuse after orderly release and bounded
  recovery after abrupt owner death through every supported alias spelling;
- full attach, mini attach, and `run --attach` remain clients while an owner is
  active and do not create or migrate the client's local database; and
- real local TUI, command, server, and `pr` launch paths all acquire the same
  authority boundary; focused migration/admission checks and affected package
  typechecks pass.

Alias fixtures must distinguish an unsupported platform feature from a passing
oracle; silently skipping an available alias class cannot close the Gate. Tests
target these admissions, authority/open race boundaries, crash behavior, and
real processes. No monorepo-wide test or unrelated learning feature belongs to
this evidence claim.

## Result

Gate 6 was recorded passed on 2026-07-14 at fork implementation commit
`6c0b7aa5b`. The later audit preserves the admission and migration results below
but invalidates the runtime-owner completion claim until the physical-authority
and rendezvous correction closes.

The implementation now:

- initializes a missing path from the complete generated schema with
  `application_id`, `user_version`, and one `repa_migration` baseline row;
- admits only an exact Repa journal prefix and applies each later Repa migration
  atomically with its version and journal advance;
- leaves inherited migration source in place as history while removing it from
  runtime discovery and generation;
- refuses foreign, future, inconsistent, unreadable, and integrity-invalid
  databases without importing their journals or replacing their files;
- attempted to acquire one process-level ownership lease before local AppRuntime
  or database materialization, with immediate busy refusal and stale-lock
  recovery for identical configured path strings; the later audit proved that
  this lexical identity and configurable rendezvous were insufficient;
- keeps full attach outside the local runtime command wrapper, routes mini
  attach through the same client-only `run --attach` selection, and ensures
  local TUI, command, server, and instance cleanup releases ownership; and
- retains local `pr` behavior without making its parent process compete with
  the Repa child it launches, while leaving `db path` available when admission
  fails.

Focused evidence was deliberately limited to claims this Gate changed:

- `packages/core`: typecheck passed; the migration generator check passed;
  `test/database-migration.test.ts` passed 17 tests covering baseline creation,
  rejection, rollback, integrity, reopen, and concurrent initialization;
- the existing filesystem-lock crash test plus the new immediate-acquire and
  synchronous-release tests passed;
- `packages/opencode`: typecheck passed; real-process ownership and
  non-destructive CLI admission tests passed; and
- two live `run --attach` process cases passed while an owning server was
  active. Focused TUI routing, error-formatting, and local `pr` checks also
  passed.

Those historical owner tests used the same configured path spelling and lock
root. They remain evidence for acquisition lifecycle and attach classification,
but cannot close physical identity, cross-state-root rendezvous, missing-path,
hardlink, or authority/open TOCTOU behavior. Gate 6 closes again only with the
re-derived evidence above.

No monorepo-wide suite or generic database-repair framework was added. At this
checkpoint Gate 7 had not begun; its original contract and the other unexecuted
Gate 7–19 contracts were later superseded. Gate-based engineering was retained,
but the post-Gate-6 architecture and roadmap grill must first establish the
overall structural direction and dependency order. Only then is it divided into
Gates, each of which is grilled again before implementation.
