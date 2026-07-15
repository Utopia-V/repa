# OpenCode fork Gate 6: native database admission

Historical result: Passed at fork implementation commit `6c0b7aa5b`; its
runtime-owner claim was later invalidated. Corrected runtime-owner result:
passed at `16fcb3177`, then invalidated by the sidecar and dangling-symlink
counterexamples below. The second correction passed at `34588b041`. Current
disposition is owned by
[the documentation index](../README.md).

Date: 2026-07-14

Parent plan: [Roadmap 09](../roadmap/09-one-time-opencode-fork-baseline.md)

Decisions: [ADR-0012](../decisions/0012-learning-centered-modular-monolith.md)
and [ADR-0014](../decisions/0014-one-time-opencode-fork.md)

This record owns the Gate 6 contract. It preserves the maintainer decisions,
the source evidence that constrains their implementation, and the evidence
that closes the Gate. The contract authorizes only the production changes named
below.

## Second post-close audit correction

The next 2026-07-15 audit found two P1 counterexamples outside the evidence that
closed `16fcb3177`:

- merely placing an empty or stale `-journal`, `-wal`, or `-shm` beside a clean
  non-empty identityless SQLite file caused physical preflight to bypass clean
  foreign rejection. Migration then treated `application_id = 0` plus no user
  tables as fresh and converted that foreign file into a Repa database;
- when a final file symlink pointed to a missing target, `existsSync()` treated
  the configured alias as absent. SQLite followed the link for the main file
  but named WAL from the alias spelling, so an abrupt owner death could strand
  committed frames where neither later alias nor target reopening consumed
  them.

These findings reopen only the runtime admission/identity proof. Sidecars may
justify entry into bounded SQLite recovery, but never authorize Repa
initialization. After recovery, initialization requires proof that the database
has returned to the empty acquisition state; the absence of user tables is not
that proof. A dangling final file symlink refuses before SQLite open unless its
target already exists and can be resolved to the one main-file authority.
Existing resolvable file symlinks remain supported aliases.

Closure additionally required clean identityless fixtures paired in turn
with empty or stale journal, WAL, and SHM sidecars to refuse without any
Repa-authored write, plus real-runtime proof that a dangling final file symlink
cannot reach SQLite and split main/WAL identity. Gate 7's accepted Course/View
contract, schema, migration, implementation, and focused evidence remained
closed; at that audit point, production consumption waited for this Gate 6
runtime prerequisite to be restored.

Implementation commit `34588b041` closes both counterexamples without adding a
second lock, sidecar parser, repair framework, or compatibility path. Physical
preflight uses `lstat` to distinguish an absent final path from a present but
unresolvable file symlink. Migration no longer accepts a caller-supplied
`fresh` classification: after SQLite recovery, only
`application_id = 0`, `user_version = 0`, and `page_count = 0` constitute the
empty acquisition state. A page-backed identityless database remains foreign
even when it has no user tables.

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
connection as the intended owner, and design commit `9cc3fe17f` derived an exact
open-then-lock sequence from that decision. A later crash-state audit disproved
the sequence as a universal pre-admission mechanism. `BEGIN EXCLUSIVE` can make
SQLite roll back a hot journal before ordinary reads, and closing the last WAL
connection can checkpoint committed frames and remove sidecars. Constructing a
candidate connection is therefore not a reliably non-mutating lock attempt for
an existing non-empty database.

That finding reopened the ordering between physical preflight, SQLite recovery,
admission classification, and exclusive ownership. The maintainer accepted
bounded SQLite recovery on 2026-07-15: a side-effect-free physical preflight
rejects a clean database that is already identifiable as foreign; a crash set
whose logical identity cannot be known without SQLite may undergo only the
pager's standard recovery before the same retained connection obtains exclusive
ownership and runs admission. This does not restore the old path-keyed lease,
discard the one-retained-connection goal, or authorize a second SQLite lease
connection. Physical target resolution, hardlink rejection, and the exact
authority/open identity proof remain constrained by the stable-local-filesystem
boundary and closing evidence below.

The same audit closed a separate boundary: ordinary `Database.node` startup,
including configuration through `REPA_DB`, rejects `:memory:` because separate
processes would own separate database objects with no physical rendezvous. An
explicitly injected `layerFromPath(":memory:")` remains valid for isolated tests;
ambient environment configuration is not a test-only capability. `repa db path`
remains a no-open diagnostic and may print the configured sentinel, but every
entry point that materializes the ordinary database runtime refuses it with a
typed unsupported-storage error.

The mechanism evidence is explicit rather than resemblance-based:

- SQLite's [`locking_mode=EXCLUSIVE`](https://www.sqlite.org/pragma.html#pragma_locking_mode)
  retains the main-file lock until the owning connection closes; its
  [WAL behavior](https://www.sqlite.org/wal.html#use_of_wal_without_shared_memory)
  can remain exclusive when configured before first WAL access.
- SQLite's [open contract](https://www.sqlite.org/c3ref/open.html) states that
  `SQLITE_OPEN_EXCLUSIVE` is a no-op for ordinary database opens, so a real
  SQLite lock cannot be acquired without first constructing a connection.
- SQLite's [hot-journal recovery](https://www.sqlite.org/lockingv3.html) occurs
  before a database can be read safely, and the
  [WAL lifecycle](https://www.sqlite.org/wal.html) permits the last connection
  to checkpoint and clean WAL state. Those are SQLite-owned physical recovery
  effects, not Repa migration writes, but they invalidate a blanket claim that
  every candidate connection leaves an unadmitted database byte-for-byte
  unchanged.
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

Early isolated Windows/Bun probes informed the ownership candidate without
becoming Gate-close evidence:

- `realpathSync.native()` converged an ordinary path, directory junction, file
  symlink, available 8.3 spelling, and `\\?\` spelling. `statSync()` returned
  the same device/file identity through those aliases and exposed `nlink = 2`
  after a hardlink was added. The standard APIs therefore remain the first
  implementation candidate; no native adapter is pre-authorized.
- On fresh and ordinary clean rollback-journal/WAL fixtures, one retained Bun
  connection configured for exclusive locking and forced with `BEGIN
EXCLUSIVE` rejected a real contender with `SQLITE_BUSY`. Owner close allowed
  immediate reacquisition, and a fresh attempt left only a zero-byte main file.
  These probes established ordinary lock behavior; they did not exercise an
  unadmitted hot journal or committed crash WAL and therefore did not establish
  non-destructive classification.
- A separate forced-termination probe killed the lock holder for all three
  database states. The OS released the lock immediately; the next process
  acquired it, SQLite cleaned the abandoned empty journal/WAL artifact, and
  existing main-file hashes remained unchanged. This supports OS/SQLite crash
  recovery but does not replace the real-entrypoint closing oracle.
- The later adversarial probe constructed both missing-to-existing and genuine
  crash states. It observed a foreign hot journal being rolled back and removed
  during the prescribed lock sequence, and a crash WAL being checkpointed and
  removed when the candidate connection closed. A read-only connection could
  observe committed identity held only in WAL but changed shared-memory state;
  a hot journal that required rollback instead failed read-only. Bun did not
  provide a verified immutable URI path that both interpreted those states and
  preserved every main/sidecar byte. Gate 6 must therefore decide the recovery
  boundary rather than hide it inside the lock implementation.

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
  causes startup refusal before any Repa-authored mutation. A clean foreign file
  that physical preflight can identify remains byte-for-byte unchanged. An
  ambiguous hot-journal/WAL crash set may undergo SQLite's standard physical
  recovery before classification; this preserves its committed logical state
  but may roll back uncommitted pages, checkpoint committed frames, rebuild SHM,
  or clean sidecars. Repa preserves the configured path and does not
  automatically quarantine it or create an apparently empty LearnerHome. This
  rare path does not justify a general repair framework.
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
clear refusal, explicit attach clients, and no Repa-authored invalid-database
mutation—but did not settle physical authority identity or a universal
rendezvous. The no-compatibility boundary and implementation evidence did settle
the independent lineage question:

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

## Accepted recovery semantics

Standard SQLite facilities cannot both interpret every hot-journal or crash-WAL
state well enough to classify its final logical database and guarantee that the
original main file plus all sidecars remain byte-for-byte unchanged. Raw header
inspection can reject a plainly foreign clean file, but it cannot establish
integrity or see identity committed only in WAL. Read-only open can require
hot-journal rollback or shared-memory recovery; backup, copy, and ordinary query
APIs still enter SQLite's pager and recovery machinery.

Gate 6 therefore accepts one bounded recovery model:

1. Physical preflight rejects, without SQLite open or side effects, a clean
   non-empty file whose main-file identity already proves it is foreign.
2. A hot journal, WAL, or other recognized crash set whose final logical
   identity cannot be established by that preflight may be opened by the one
   retained connection. SQLite alone may roll back uncommitted pages,
   checkpoint committed frames, rebuild shared state, and clean sidecars.
3. The same connection then obtains and retains exclusive ownership and runs
   admission. Until admission succeeds, Repa performs no schema, migration,
   application-identity, version, migration-journal, journal-mode, repair, or
   replacement write. A rejected database retains the logical state produced
   by standard SQLite crash recovery at the configured path.
4. Fresh baseline identity, version, schema, and the baseline migration journal
   commit atomically in rollback mode. WAL is enabled only after that commit, so
   a successfully published Repa identity is present in the main-file header and
   never depends solely on WAL.

This preserves normal SQLite crash recovery while preventing recovery from
becoming an implicit Repa migration or repair policy. A custom VFS, journal
parser, filesystem snapshot system, backup manager, or manual-recovery-only
runtime is outside this Gate.

## Accepted implementation boundary

The lineage, local-storage, `:memory:`, physical-recovery, and rendezvous
requirements below are accepted and authorize the corresponding production
implementation.

Gate 6 establishes three connected boundaries and no fourth subsystem:

1. **Database admission.** A winning ownership attempt initializes an empty
   acquisition state as the complete current schema in one rollback-mode
   transaction, with a stable Repa application identity, baseline schema
   version, and exactly one Repa baseline journal entry. SQLite may spill pages
   before that transaction commits: abrupt termination can therefore leave a
   non-zero main file with `application_id = 0` and a hot journal. On the next
   launch, bounded SQLite recovery may roll that state back to the empty
   acquisition state, which is then initialized exactly once. A clean non-empty
   identityless file, or a recovered state that remains non-empty without a
   valid Repa identity, is foreign and refuses. For every existing authority,
   physical preflight, permitted pager recovery, exclusive ownership, and
   admission follow the accepted sequence above; `9cc3fe17f`'s unconditional
   mutation-free-open claim has no authority.
2. **Forward lineage.** The runtime registry contains only migrations authored
   after the Repa baseline. An existing Repa database is admitted only when its
   application identity, schema version, and ordered journal form an exact
   prefix of that registry. A recognized suffix advances one transaction at a
   time; the schema change, journal row, and version advance commit or roll back
   together. Inherited migration files may remain testable historical source,
   but the generator and runtime registry no longer discover them.
3. **Runtime ownership.** Before materializing local AppRuntime, HTTP state, or
   learning-state access, a process resolves and validates the configured local
   target and eventually acquires the physical main-file lock on the same
   connection retained for database use. Existing aliases to one database
   converge there, contenders with different application-state roots still
   meet there, and unsafe hardlink aliases refuse before SQLite journal/WAL or
   application access. Concurrent creators of one missing target may create or
   open the same canonical empty main file, but only its exclusive lock winner
   may initialize it; a later contender that observes the now-existing file
   must meet that same live owner. The point at which an existing non-empty
   target is physically preflighted before open. A clean foreign target refuses;
   every eligible or ambiguous target is opened once, may undergo the bounded
   pager recovery above, then acquires exclusive ownership and runs admission on
   that same retained connection. For a stable target, the resolved identity and
   actual opened main file agree before any permitted effect. An explicit attach
   client bypasses local state materialization. Orderly connection close releases
   ownership, and process death delegates lock release and bounded recovery to
   SQLite and the OS rather than a heartbeat policy.

Ordinary runtime materialization additionally rejects `:memory:` before SQLite
open, admission, migration, or AppRuntime construction. Only an explicitly
injected test database layer may opt into process-private in-memory storage.

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

- A busy LearnerHome may perform physical preflight, the bounded SQLite pager
  recovery required to reach a consistent database, and the physical lock
  attempt. It refuses on contention before Repa admission SQL, journal-mode
  changes, migration, local AppRuntime, or learning-state access. The message
  identifies the configured home/database and points an intentional server user
  to explicit `repa attach`; it does not wait five minutes or start a second
  read-only runtime.
- A foreign, unsupported-old, future, partial, or corrupt database fails with a
  typed admission reason. A clean file identifiable by physical preflight stays
  byte-for-byte unchanged. An ambiguous crash set may contain the pager's
  recovered physical representation but no Repa-authored mutation. Repa leaves
  the configured path in place and names it so the learner can move, inspect,
  or remove it deliberately.
- Permission, lock-infrastructure, and unrelated I/O failures remain distinct
  from “another owner” and from database corruption.
- Failed fresh initialization or forward migration cannot publish a Repa
  identity/version/journal advance without the corresponding schema state.
- Normal shutdown closes the retained connection and releases immediately.
  Forced termination relies on OS handle cleanup and the accepted bounded SQLite
  recovery on the next startup; Gate 6 does not add a heartbeat, stale-lock
  eviction, daemon, PID supervisor, or repair service for this rare path.
- An ordinary runtime configured with `:memory:` fails with a distinct typed
  unsupported-storage reason rather than pretending to satisfy ownership or
  being misreported as corruption. The no-open path diagnostic remains usable.

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
- for a target allowed to reach SQLite ownership, ownership and database use
  converge on one native connection, which supplies the SQL/Drizzle views until
  layer finalization. A second lease connection or external owner token would
  recreate the split this correction removes.
- acquisition order is explicit: resolve and validate the stable local target;
  reject `:memory:`, remote storage, hardlinks, and a clean non-empty main file
  whose header already proves it is foreign; construct one native connection for
  every remaining fresh, Repa-attributed, or crash-ambiguous target; let only
  SQLite's pager perform any required rollback/checkpoint/SHM/sidecar recovery;
  configure and force exclusive main-file locking; retain that same connection;
  then classify and admit without a Repa-authored write until admission
  succeeds. `SQLITE_BUSY` after bounded recovery is ordinary owner contention.
- fresh initialization commits the complete baseline, application identity,
  version, and migration journal in rollback mode before the retained connection
  enables WAL. A cache-spill crash before commit is a recoverable acquisition
  state, not a clean foreign database merely because its main file is non-zero.
- cross-process rendezvous is the physical main-file lock, never a lock below a
  caller-selectable application-state root. Hardlink or target-identity failure
  closes before SQLite creates a journal/WAL or performs application access.
- missing-path creation, the missing-to-existing transition, ordinary use, and
  final release form one SQLite ownership lifecycle. No path-state observation
  selects a second lock domain.
- `Database.node` owns rejection of `:memory:` for ordinary runtime
  materialization. Tests that need process-private storage inject
  `layerFromPath(":memory:")` explicitly rather than obtaining it from
  `REPA_DB`, preload state, or a test-process exception.
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
- a clean non-empty identityless database paired in turn with an empty or stale
  `-journal`, `-wal`, or `-shm` remains foreign after any bounded pager handling;
  sidecar presence alone never grants initialization, and no Repa identity,
  schema, version, or migration journal is written;
- an injected forward migration failure leaves schema, version, journal, and
  prior rows at the previous recognized state;
- two real owner processes targeting one clean admitted database through the
  ordinary path, a directory junction, a file symlink, 8.3/long spelling, and
  DOS/extended spelling meet at one physical SQLite lock. The loser performs
  only the operations permitted by the accepted acquisition boundary and does
  not enter Repa admission, migration, or application access;
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
- killing the winner after exclusive acquisition but before baseline commit may
  leave either a zero-byte main file or a non-zero `application_id = 0` main file
  plus a hot journal after SQLite cache spill. The next owner performs bounded
  recovery; if it returns to the empty acquisition state, Repa initializes the
  baseline exactly once. A clean identityless file, or a recovered non-empty
  state that still lacks valid Repa identity, follows foreign-database refusal;
- a barriered missing-to-existing handoff starts owner A while the path is
  absent, pauses A only after it has created and opened SQLite while retaining
  ownership, then starts contender B after B can observe the existing file. B
  may open only to attempt the same physical SQLite lock and must refuse before
  every later database action while A remains live; after A releases, B must
  acquire ownership and reopen the published database normally;
- stable target resolution and the opened main file agree before side effects;
  deliberately mutating the target concurrently is outside the supported
  boundary rather than a closing oracle;
- a real runtime launched through a final file symlink whose target does not yet
  exist refuses before SQLite open and leaves both target and alias sidecars
  absent. Because no owner can reach a commit through this configuration, the
  former crash/reopen split path is structurally unreachable; resolvable file
  symlinks continue to converge normally;
- the retained connection shows immediate reuse after orderly close and OS lock
  release after abrupt owner death through every supported alias spelling,
  without heartbeat expiry or stale-lock deletion. Any subsequent SQLite
  recovery follows the accepted recovery contract rather than being assumed by
  this ownership oracle;
- full attach, mini attach, and `run --attach` remain clients while an owner is
  active and do not create or migrate the client's local database; and
- `db path` remains usable when admission cannot run, `db <query>` uses the same
  exclusive main connection and receives the ordinary busy refusal, and the
  no-query form never spawns an external `sqlite3` behind an active Repa
  connection; and
- with `REPA_DB=:memory:`, the real no-open `db path` command reports the
  configured value, while two independently launched state-owning entry points
  each fail before SQLite/AppRuntime materialization with the same typed
  unsupported-storage reason. Focused tests that require an in-memory database
  succeed only through explicit layer injection; no preload or inherited
  environment variable makes ordinary `Database.node` accept it; and
- real local TUI, command, server, and `pr` launch paths all acquire the same
  authority boundary; focused migration/admission checks and affected package
  typechecks pass.

Bounded-recovery evidence proves clearly foreign clean fixtures remain
byte-for-byte unchanged; Repa-attributed and ambiguous hot-journal/WAL fixtures
undergo only the enumerated SQLite pager effects; recovered Repa state is then
admitted correctly; and an ultimately rejected fixture gains no Repa-authored
logical, identity, version, journal-mode, schema, migration, repair, or
replacement write. A cache-spill baseline fixture with a non-zero identityless
main file and hot journal rolls back to the empty acquisition state and
initializes exactly once. Fresh creation proves stable identity is in the main
file before WAL is enabled and remains unchanged thereafter.

Alias fixtures must distinguish an unsupported platform feature from a passing
oracle; silently skipping an available alias class cannot close the Gate. Tests
target these admissions, authority/open race boundaries, crash behavior, and
real processes. No monorepo-wide test or unrelated learning feature belongs to
this evidence claim.

## Result

Gate 6 was recorded passed on 2026-07-14 at fork implementation commit
`6c0b7aa5b`. The later audit preserves the admission and migration results below
but invalidated that commit's runtime-owner completion claim. Design commit
`9cc3fe17f` selected a promising retained-connection mechanism but did not pass
the later crash-state audit; its claim that open-and-lock was mutation-free is
not an accepted implementation contract. `d7855d4ce` accepted the corrected
bounded-recovery sequence, and `16fcb3177` implemented it with the closing
evidence below. Gate 6 was recorded closed again at that implementation commit,
but the second post-close audit above invalidated the completion claim. The
evidence remains historical support for unaffected behavior. `34588b041` then
implemented the second correction and closes the Gate again.

The second correction removed the preflight-to-migration initialization bit and
the no-user-table freshness heuristic. Empty and stale journal/WAL/SHM fixtures
paired with clean, non-empty identityless databases at user versions zero and
seven all refuse without Repa identity, schema, version, or journal writes. A
dangling final file symlink refuses before target creation or sidecar creation
through both the Core runtime layer and a real OpenCode owner process. Existing
cache-spill recovery still returns to the zero-page state and initializes
exactly once; recognized Repa WAL, ambiguous foreign WAL, concurrent creation,
missing-to-existing handoff, ordinary aliases, hardlink/UNC refusal, and owner
release remain intact.

Fresh causal evidence for `34588b041` was:

- the two new Core counterexample tests failed before the implementation because
  both runtime layers succeeded, then passed after the correction;
- the Core database-authority and migration files passed 27 tests with 158
  assertions, including the new empty/stale sidecar matrix and retained crash
  recovery cases;
- the real OpenCode owner-process file passed four tests with 47 assertions,
  including the dangling-symlink refusal and the existing alias/lifecycle
  matrix; and
- Core and OpenCode typechecks, Prettier, and Git diff checks passed.

The first runtime-owner correction at `16fcb3177`:

- resolves the stable local target before SQLite open, converges supported
  filesystem aliases, and rejects hardlinks and recognized remote targets
  before journal/WAL or application access;
- gives fresh, recognized Repa, and crash-ambiguous targets one native
  connection which performs permitted pager recovery, acquires exclusive
  ownership, runs admission, supplies SQL/Drizzle, and releases on layer close;
- rejects ordinary `Database.node`/`REPA_DB=:memory:` materialization while
  retaining explicit `layerFromPath(":memory:")` test injection;
- publishes fresh schema, identity, version, and journal in rollback mode
  before enabling WAL, including recovery from a non-zero identityless
  cache-spill main file and hot journal;
- removes the separate state-root filesystem lease, converges AppRuntime and
  listener graphs on the process memo map, and makes TUI/command/server paths
  consume the database-owned lifetime; and
- keeps `db path` as a no-open diagnostic, makes `db <query>` use the retained
  authority, and refuses the inherited no-query external `sqlite3` branch.

Evidence recorded for `16fcb3177` was limited to claims that could falsify that
boundary:

- Core authority and migration tests passed 25 tests with 96 assertions. They
  covered clean-foreign byte preservation, retained-lock release, baseline
  cache-spill recovery, Repa and foreign WAL recovery, fresh/upgrade equivalence,
  admission failures, and atomic forward migration. Core typecheck and the
  migration generator check passed.
- Real OpenCode owner processes passed four tests with 38 assertions across
  different state roots, concurrent missing creation, a barriered
  missing-to-existing handoff, orderly and abrupt release, directory/file
  aliases, available 8.3 and extended spellings, hardlink refusal, and UNC
  refusal.
- Real CLI and server tests passed 11 tests with 35 assertions for clean foreign
  refusal, actionable errors, `:memory:`, query/shell behavior, one owning
  server, and client-only `run --attach`. The local `pr` launch test passed
  separately with six assertions, and same-process listener reuse was exercised
  without a second database owner. OpenCode typecheck passed.
- Gate 7's Course/View focused tests passed nine tests with 117 assertions as a
  dependency smoke check. They did not reopen or modify the Gate 7 contract,
  schema, migration, or implementation.
- Prettier and Git diff checks passed. No monorepo-wide suite, custom VFS,
  recovery framework, network-database classifier, or unrelated learning
  mechanism was added.

The original implementation had already:

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

Original focused evidence was deliberately limited to claims that close had
changed:

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
but could not close physical identity, cross-state-root rendezvous,
missing-path, hardlink, or authority/open TOCTOU behavior. The correction and
fresh evidence above now close those claims.

No monorepo-wide suite or generic database-repair framework was added. At the
original checkpoint Gate 7 had not begun; its original contract and the other
unexecuted Gate 7–19 contracts were later superseded. The replacement Gate 7
Course/View authority is now independently closed, and this runtime correction
restores its one-owner production prerequisite without changing its design.
