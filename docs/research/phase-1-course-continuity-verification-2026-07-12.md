# Course-continuity milestone verification

Date: 2026-07-12

Status: Phase-boundary evidence for roadmap 06 and ADR-0012. This record
describes observed behavior and remaining limits; it is not a claim that the
whole learning product is complete.

## Result

The milestone now supports both accepted course starts through one durable Course
View authority:

- workspace-confined Markdown becomes a source-grounded, revision-bound
  ordered hierarchy with exact material alignments;
- a subject without material becomes a visibly `model_proposed` provisional
  hierarchy;
- route position, active view, source revision, and current focus survive a
  database reopen and a genuinely new Session;
- exact material remains lazy and does not enter routine context, tool
  receipts, or compact Session tool items;
- the Agent can inspect, re-anchor, revise, and explicitly realign instead of
  rewriting old views or material observations; and
- one state-changing terminal process owns a LearnerHome while it is running.

This is a complete course-genesis/material-continuity behavior over the
accepted modular-monolith architecture. It is not a mastery model, activity
history, scheduler, or TUI.

## Durable ownership and module boundaries

| Meaning | Production owner |
| --- | --- |
| Session, Turn, model/tool lifecycle | `src/interaction/records.ts` |
| ordered schema migration | `src/storage/open-database.ts` |
| one state-changing LearnerHome owner | `src/storage/learner-home-owner.ts` |
| Markdown confinement, revision, outline, bounded read | `src/sources/markdown-artifact.ts` |
| immutable Course View materialization | `src/learning/curriculum/course-view-revisions.ts` |
| course genesis, active route, compact projection | `src/learning/curriculum/course-view.ts` |
| inspection, re-anchor, view supersession, realignment | `src/learning/curriculum/course-correction.ts` |
| trusted course tool execution and atomic settlement | `src/learning/curriculum/course-tool-execution.ts` |
| structured sample context | `src/tutor/compile-context.ts` |
| model-facing rendering | `src/tutor/render-system-prompt.ts` |
| sample-narrowed AI SDK bindings | `src/runtime/tutor-tools.ts` |
| one Turn owner | `src/runtime/run-tutor-turn.ts` |

Learning and source modules import neither AI SDK nor providers. The runtime
binds model calls to the persisted context cut; the model does not supply a
trusted course ID, view revision, route version, material path, material
revision, or line range for current-item operations.

## Writer-ownership decision

The initial comparison considered heartbeat lock directories and native addon
file locks. The selected mechanism instead reuses SQLite's operating-system
locking through a separate, data-free ownership database:

1. canonicalize the main LearnerHome database path;
2. open `<database>.writer-owner.sqlite`;
3. hold `BEGIN IMMEDIATE` for the lifetime of the state-changing process; and
4. `ROLLBACK` and close on normal release.

The ownership transaction is not held on the state database, so interaction
and domain transitions still commit independently during model I/O. A second
owner gets `SQLITE_BUSY`; process exit closes the connection and releases the
operating-system lock without a guessed stale timeout.

This preserves the SQLite invariant that only one write transaction exists for
one database file and uses its documented process locking rather than
reimplementing a heartbeat protocol. Sources consulted:

- [SQLite transaction semantics](https://www.sqlite.org/lang_transaction.html)
  (`BEGIN IMMEDIATE`, `SQLITE_BUSY`, close/rollback behavior);
- [SQLite file locking and concurrency](https://www.sqlite.org/lockingv3.html)
  (pager-owned cross-process locks and Windows `LockFileEx`); and
- [proper-lockfile design](https://github.com/moxystudio/node-proper-lockfile)
  as a rejected comparison for `mkdir`/mtime heartbeat and stale-lock
  compromise behavior.

Executable evidence uses two Bun child processes: a live owner rejects a
contender, and an owner that exits without calling `release` permits immediate
successor acquisition.

## Deterministic behavior evidence

The production tests demonstrate:

- nested ATX headings, fenced-code exclusion, exact direct-section ranges,
  workspace confinement, and content-drift failure;
- schema 1 -> 2 -> 3 migration, preservation of interaction history,
  rollback of a failed migration, and the Course View transition ledger;
- compact course context across reopen without source prose;
- material read -> teaching -> atomic route advance -> fresh-Session bounded
  read;
- Markdown genesis and no-material genesis through one Course View model;
- source drift -> `stale_material_revision` -> explicit realignment -> bounded
  reread;
- provisional inspect -> immutable superseding revision -> explicit route
  re-anchor;
- route-effect and tool-receipt rollback together when settlement is forced to
  fail; and
- retained steering and earlier runtime failure/recovery behavior remain green.

At this boundary, `bun run check` reports:

```text
122 pass
0 fail
876 expect() calls
```

It also verifies pinned OpenCode/Codex references and type-checks production
plus the DeepSeek labs.

## Real-provider trace, including the failure

The fixture `tmp/phase1-dogfood/objects.md` used unique tokens in three bounded
sections.

### Attempt 1: useful failure

The real `deepseek-v4-flash` Tutor registered the Markdown and executed a
bounded current-material read, but it did not call `advance_course_route` even
though the learner requested “teach this section, then advance.” It instead
asked the learner to confirm readiness. Durable inspection showed route
version 1 at `Object identity` and only registration/read invocations.

The correction did not add host-side text inference or an automatic write.
Tutor policy and the capability description were clarified: an explicit
learner request to explain and advance in the same Turn is already the needed
confirmation, and the advance may accompany the explanation without implying
mastery. A deterministic prompt oracle preserves this distinction.

### Attempt 2: grounded start and advance

With a fresh database, the real Tutor:

1. called `register_markdown_course`;
2. called `read_current_course_material` for lines 1-5 at the observed SHA-256
   revision;
3. included the exact `IDENTITY-731` source token in its explanation; and
4. called `advance_course_route`, producing route version 2 at `Aliasing`.

The run used four model steps, 8,030 tokens, and the existing conservative cost
estimator reported an upper bound of USD 0.001192.

### Fresh Session

A different Session in the same LearnerHome received only a new “continue”
request. It selected `Aliasing`, lazily read lines 6-10, and included the exact
`ALIAS-284` token. Durable inspection found:

```text
active route: Aliasing, version 2
fresh Session roles: user, tool, assistant
fresh Session contains IDENTITY-731: false
fresh compact tool item contains ALIAS-284: false
any model context_json contains either source token: false
```

The assistant response naturally contains `ALIAS-284`, because that is the
learner-visible teaching result. The material copy is absent from system state,
context cuts, and tool receipts.

## Milestone boundary and remaining limits

The course-continuity milestone does not claim that an explanation proves learning. Route position is
navigation continuity only. No learner activity/evidence record was added to
make the trace look more measurable.

The earlier recommendation to make generic activity/progress the automatic
next phase was withdrawn after the first-principles teaching and review audit.
An explained range may remain a useful local fact, but it does not define the
next product outcome. The active build map now pressures an end-to-end teaching,
adaptation, and later-return behavior and lets that path earn only the learner,
Agenda/revisit, evidence, and context distinctions it actually consumes. Those
meanings remain separate authorities rather than hidden additions to Course
View.

Follow-on ALS-020 has since earned one of those meanings: a specific,
source-linked Agenda future-attention concern, separate from the later activity
and learning evidence. Its production representation remains deliberately
unfixed; see
[`teach-adapt-return-architecture-proof-2026-07-12.md`](./teach-adapt-return-architecture-proof-2026-07-12.md).
