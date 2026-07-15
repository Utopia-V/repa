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

The 2026-07-15 runtime-ownership grill selected the single retained main SQLite
connection as the owner. A contender may open the canonical main database only
to configure and force SQLite exclusive locking. If it cannot acquire that
lock, it closes before database admission, journal-mode changes, migration,
AppRuntime materialization, or learning-state access. The winning connection is
the connection the database layer retains for the complete owner lifetime; no
external path-keyed lease or second SQLite lease connection may stand between
ownership and the database actually used.

This replaces the earlier derived requirement that a contender fail before any
SQLite open. That requirement was not a maintainer-owned product behavior and
would exclude the mature primitive whose lock is attached to SQLite's actual
main file. Physical target resolution, hardlink rejection, and the exact
authority/open identity proof are constrained by the stable-local-filesystem
boundary and closing evidence below; a `realpath`-only or file-ID-only patch is
still not an accepted repair. The runtime correction remains outside database
migration and learning-domain APIs.

The mechanism evidence is explicit rather than resemblance-based:

- SQLite's [`locking_mode=EXCLUSIVE`](https://www.sqlite.org/pragma.html#pragma_locking_mode)
  retains the main-file lock until the owning connection closes; its
  [WAL behavior](https://www.sqlite.org/wal.html#use_of_wal_without_shared_memory)
  can remain exclusive when configured before first WAL access.
- SQLite's [open contract](https://www.sqlite.org/c3ref/open.html) states that
  `SQLITE_OPEN_EXCLUSIVE` is a no-op for ordinary database opens, so a real
  SQLite lock cannot be acquired without first constructing a connection.
- At decision commit `e246127b6`, `packages/core/src/database/sqlite.bun.ts`
  creates one native connection, serializes its use, supplies that same object
  to the SQL and Drizzle views, and closes it with the layer. The retained main
  connection therefore already has a real lifecycle to own; a second lease
  connection would conflict with it.
- Pinned OpenCode and Codex use WAL/busy handling but do not establish one
  cross-process runtime owner for a physical database. Their storage behavior
  is negative comparison evidence, not a mechanism that satisfies this Repa
  invariant.

The same grill limits this database guarantee to a stable local filesystem:

- Repa's internal `repa.db` must live on a local volume whose OS locking SQLite
  can rely on. A recognized UNC/remote target refuses with an explicit
  unsupported-storage error; other unproven mapped-remote paths remain outside
  support. SQLite itself documents the hazards of
  [database use over network filesystems](https://www.sqlite.org/useovernet.html).
- Stable pre-existing junction, file-symlink, 8.3/long, and DOS/extended
  spellings remain supported aliases and must converge. A detected hardlink is
  rejected because distinct journal/WAL names can corrupt one physical main
  file.
- Repa does not promise to survive an external actor renaming, retargeting,
  replacing, or adding links to the live database during startup or use. That
  is unsupported external mutation, not a reason to add a custom VFS or native
  anti-tamper subsystem.
- This restriction applies only to Repa's internal database. Learning-material
  locations and later content roots retain their separately authorized storage
  policy.

Two isolated Windows/Bun probes informed the remaining implementation without
becoming Gate-close evidence:

- `realpathSync.native()` converged an ordinary path, directory junction, file
  symlink, available 8.3 spelling, and `\\?\` spelling. `statSync()` returned
  the same device/file identity through those aliases and exposed `nlink = 2`
  after a hardlink was added. The standard APIs therefore remain the first
  implementation candidate; no native adapter is pre-authorized.
- On fresh, rollback-journal, and existing-WAL databases, one retained Bun
  connection configured for exclusive locking and forced with `BEGIN
EXCLUSIVE` rejected a real contender with `SQLITE_BUSY`. The contender did
  not change existing database bytes or sidecars, owner close allowed immediate
  reacquisition, and lock-only artifacts disappeared on close. A fresh attempt
  left only a zero-byte main file after close, so interrupted pre-baseline
  acquisition has a narrow observable state that the final recovery contract
  can distinguish from a non-empty foreign database.
- A separate forced-termination probe killed the lock holder for all three
  database states. The OS released the lock immediately; the next process
  acquired it, SQLite cleaned the abandoned empty journal/WAL artifact, and
  existing main-file hashes remained unchanged. This supports OS/SQLite crash
  recovery but does not replace the real-entrypoint closing oracle.

The same probe showed that Bun's Windows `statfs` filesystem type is not a
remote-volume classifier. The implementation must reject recognized remote/UNC
targets and treat other unproven remote mappings as unsupported; it must not add
a native dependency solely to claim detection of every administrator-created
mapped drive.

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
- `repa db path` remains a no-open diagnostic, and `repa db <query>` remains an
  explicit one-shot admin command through the retained Repa connection. The
  inherited no-query branch that spawns an external interactive `sqlite3`
  process from inside AppRuntime is hibernated because it would compete with
  Repa's own exclusive connection. This is not a permanent rejection of an
  interactive admin mode; a future consumer may justify a sole-owner mode that
  acquires the same main-file lock before exposing a prompt.
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
audit required the local grill recorded above; it selected retained-main-
connection ownership without reopening that lineage decision.

## Accepted implementation boundary

Gate 6 establishes three connected boundaries and no fourth subsystem:

1. **Database admission.** Only the connection that has acquired runtime
   ownership may classify or initialize the database. A fresh empty main file
   created by the ownership attempt is initialized as the complete current
   schema in one transaction, with a stable Repa application identity, a
   baseline schema version, and exactly one Repa baseline journal entry. An
   existing authority is classified before Repa changes journal mode,
   checkpoints WAL, creates tables, or writes a migration row. Failed or
   interrupted ownership attempts do not promote an empty file into an admitted
   Repa database. After the next process reacquires ownership and SQLite cleans
   any lock artifact, a zero-byte main file is the sole uninitialized
   acquisition state that may proceed as fresh; every non-empty identityless
   database remains foreign and refuses non-destructively.
2. **Forward lineage.** The runtime registry contains only migrations authored
   after the Repa baseline. An existing Repa database is admitted only when its
   application identity, schema version, and ordered journal form an exact
   prefix of that registry. A recognized suffix advances one transaction at a
   time; the schema change, journal row, and version advance commit or roll back
   together. Inherited migration files may remain testable historical source,
   but the generator and runtime registry no longer discover them.
3. **Runtime ownership.** Before materializing local AppRuntime, HTTP state, or
   running database admission, a process resolves the configured target, opens
   exactly one main SQLite connection, configures exclusive locking before
   journal/WAL setup or application access, and forces real lock acquisition.
   The narrow open and lock attempt are not database admission. The loser
   closes immediately; the winner retains that same connection until owner
   shutdown. Existing aliases to one database converge through the physical
   main-file lock, contenders with different application-state roots still
   meet there, and unsafe hardlink aliases refuse before journal/WAL or
   application access. Concurrent creators of one missing target may create or
   open the same canonical empty main file, but only its exclusive lock winner
   may initialize it. A later contender that observes the now-existing file
   still meets the same live SQLite owner. For a stable target, the resolved
   identity and the actual opened main file must agree before side effects; Repa
   does not claim protection from unsupported concurrent external mutation.
   The current worker and command entry points use this boundary; an explicit
   attach client bypasses local state materialization entirely. Orderly
   connection close releases ownership, and process death delegates lock
   release and database recovery to SQLite and the OS rather than a heartbeat-
   based stale-owner policy.

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

- A busy LearnerHome may perform only target resolution, construction of one
  main SQLite connection, exclusive-lock configuration, and the forced lock
  attempt. It closes on contention before admission or integrity SQL,
  journal-mode changes, migration/recovery, local AppRuntime, or learning-state
  access. The message identifies the configured home/database and points an
  intentional server user to explicit `repa attach`; it does not wait five
  minutes or start a second read-only runtime.
- A foreign, unsupported-old, future, partial, or corrupt database fails with a
  typed admission reason. Repa leaves the configured path in place and names
  it so the learner can move, inspect, or remove it deliberately.
- Permission, lock-infrastructure, and unrelated I/O failures remain distinct
  from “another owner” and from database corruption.
- Failed fresh initialization or forward migration cannot publish a Repa
  identity/version/journal advance without the corresponding schema state.
- Normal shutdown closes the retained connection and releases immediately.
  Forced termination relies on OS handle cleanup and SQLite recovery without
  breaking a live owner; Gate 6 does not add a heartbeat, stale-lock eviction,
  daemon, PID supervisor, or repair service for this rare path.

## Explicit non-goals

- no OpenCode, pre-fork Repa, or pre-Gate-6 development-data migration;
- no automatic quarantine, replacement database, recovery wizard, backup
  manager, or raw-SQL compatibility promise;
- no preview-v2 daemon, discovery protocol, dual runtime, or future adapter;
- no remote/network LearnerHome database, live-database synchronization
  protocol, custom SQLite VFS, or defense against concurrent external database
  path mutation;
- no replacement SQL REPL or special external-admin ownership framework merely
  to preserve the inherited no-query `sqlite3` convenience;
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
- the main database connection layer owns physical target resolution, hardlink
  policy, SQLite exclusive-lock acquisition, admission ordering, and release.
  A focused platform probe determines whether standard Bun/Node filesystem APIs
  prove the accepted stable aliases and link count. A native adapter is earned
  only by a remaining accepted invariant, not by the withdrawn adversarial-
  mutation threat. The current lexical filesystem-lock primitive has no
  contractual right to survive.
- ownership and database use are one native SQLite connection. It configures
  and forces exclusive locking before admission, then supplies that same native
  object to the SQL/Drizzle views until layer finalization. A second lease
  connection or external owner token would recreate the split this correction
  removes.
- acquisition order is explicit: resolve and validate the stable local target;
  create one native connection without running admission or journal-mode setup;
  set `PRAGMA main.locking_mode=EXCLUSIVE` and zero busy wait; force acquisition
  with `BEGIN EXCLUSIVE`, then `ROLLBACK` while exclusive mode retains the
  physical lock. `SQLITE_BUSY` closes as ordinary owner contention. Every other
  result either yields the one retained owner connection or fails with its
  distinct storage/admission reason.
- cross-process rendezvous is the physical main-file lock, never a lock below a
  caller-selectable application-state root. Hardlink or target-identity failure
  closes before SQLite creates a journal/WAL or performs application access.
- missing-path creation, the missing-to-existing transition, ordinary use, and
  final release form one SQLite ownership lifecycle. No path-state observation
  selects a second lock domain.
- CLI/TUI/server entry points decide only whether they are a state owner or a
  pure attached client; they do not implement path identity or locking policy.
- `db path` remains outside runtime materialization; `db <query>` obtains the
  same one-shot main-connection ownership as other local commands. The ordinary
  no-query command does not start AppRuntime and then spawn a competing
  `sqlite3`; it reports that the integrated interactive shell is unavailable.
  Its hibernated capability disposition does not require preserving an
  incompatible reachable branch or physically deleting every related source
  fragment.
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
  DOS/extended spelling meet at one physical SQLite lock. The loser performs
  only the narrow main-connection lock attempt and leaves database bytes plus
  journal/WAL/SHM sidecars unchanged;
- the same existing database reached with different `XDG_STATE_HOME` values
  still has one rendezvous, while a hardlink alias is rejected before journal,
  WAL, admission, or application access;
- a recognized UNC/remote database target fails as unsupported before lock
  acquisition, admission, or side effects; other mapped-remote paths are not
  claimed as supported, and this oracle does not apply to independently
  authorized learning-material locations;
- two processes racing to create one missing database through aliased parent
  paths and different state roots publish exactly one initialized baseline;
  the loser does nothing beyond opening the same canonical main file and
  attempting its exclusive lock;
- killing the winner after exclusive acquisition but before baseline
  publication may leave the zero-byte main file and SQLite's transient lock
  artifact; the next owner reacquires, lets SQLite clean that artifact, and
  initializes the empty acquisition state exactly once, while a non-empty
  database without Repa identity still follows foreign-database refusal;
- a barriered missing-to-existing handoff starts owner A while the path is
  absent, pauses A only after it has created and opened SQLite while retaining
  ownership, then starts contender B after B can observe the existing file. B
  may open only to attempt the same physical SQLite lock and must refuse before
  every later database action while A remains live; after A releases, B must
  acquire ownership and reopen the published database normally;
- stable target resolution and the opened main file agree before side effects;
  deliberately mutating the target concurrently is outside the supported
  boundary rather than a closing oracle;
- the retained connection shows immediate reuse after orderly close and OS/
  SQLite recovery after abrupt owner death through every supported alias
  spelling, without heartbeat expiry or stale-lock deletion;
- full attach, mini attach, and `run --attach` remain clients while an owner is
  active and do not create or migrate the client's local database; and
- `db path` remains usable when admission cannot run, `db <query>` uses the same
  exclusive main connection and receives the ordinary busy refusal, and the
  no-query form never spawns an external `sqlite3` behind an active Repa
  connection; and
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
