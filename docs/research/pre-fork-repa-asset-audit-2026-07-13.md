# Pre-fork Repa asset disposition audit

Status: Active cutover evidence

Date: 2026-07-13

Parent decision: [ADR-0014](../decisions/0014-one-time-opencode-fork.md)

> Historical-path note: paths in this audit refer to the immutable pre-fork
> oracle at tag `repa-prefork-oracle`, not to files expected in the production
> fork. The disposition decisions remain active.

## Question

Which parts of the current Repa production tree and labs remain useful after
the one-time OpenCode fork, and in what role?

This audit prevents two symmetric errors:

- carrying the current partial harness into the fork as a compatibility layer;
  and
- deleting executable learning evidence merely because its current storage or
  runner is superseded.

The disposition is about authority and use, not whether a file is well written.
A module can be valuable evidence without being valid native-fork code.

## Fresh baseline evidence

On 2026-07-13 the unchanged pre-fork implementation passed:

```powershell
bun run check
```

Result: 244 tests passed, 0 failed, across 44 test files. This included the
production suite, deterministic labs, TypeScript checks, and pinned reference
checks. The deliberately injected provider failures printed by two tests were
expected test inputs rather than failures.

The current tree is therefore a live executable oracle at the start of the
cutover. It remains runnable in its existing history/worktree until native
replacement gates pass. This does not make it a second production runtime.

## Disposition vocabulary

| Disposition | Meaning |
| --- | --- |
| Carry candidate | Small independent logic may be retained or reimplemented only after checking whether the inherited fork already owns the same boundary and after a native consumer exists. |
| Behavioral oracle | Preserve examples, counterexamples, and outcomes; rewrite the contract against native identities and transactions instead of importing the old module. |
| Black-box oracle | Run the old entry point only in the old worktree to compare observable behavior. Never call it from the fork. |
| Historical evidence | Preserve the record and promoted conclusion. It need not remain runnable as dependencies and production code evolve. |
| Retire after replacement | Delete from the cutover line only after the named native gate proves the replacement behavior. |

## Production source ledger

| Current asset | Disposition | Reason and cutover rule |
| --- | --- | --- |
| `src/time/strict-offset-timestamp.ts` | Carry candidate | It is independent pure validation with focused tests. First compare the fork's time facilities; carry only if a real learning command still needs stricter civil-time input. |
| `src/storage/canonical-json.ts` | Carry candidate | It is an 18-line pure canonicalizer. Carry only if a native receipt or semantic-idempotency consumer needs exactly this property and the fork has no adequate equivalent. |
| `src/sources/markdown-artifact.ts` | Split candidate and behavioral oracle | Digesting and ATX parsing may remain useful implementations. Its one-workspace path boundary and Markdown-specific observation shape cannot become the general material/source authority; approved-root permissions and native source revisions replace that part. |
| `src/learning/curriculum/**` | Behavioral oracle | Course identity, versioned views, correction, lazy material, route movement, and stale-source failures are accepted behavior. The modules contain extensive direct SQL against the superseded schema, so they are not transplanted. Port one consumer contract at a time. |
| `src/learning/agenda/**` | Behavioral oracle | Source-bound creation, correction, disposition, conditional selection, and Course View targeting remain useful. The current tables and command executor are not native-fork compatibility APIs. Do not bulk-port the 2,954-line implementation. |
| `src/tutor/compile-context.ts`, `render-system-prompt.ts`, `learner-steering.ts`, and `policy-profile.ts` | Behavioral oracle | Bounded sample context, learner steering, and accepted policy distinctions remain product evidence. Their current SQL, prompt layout, tool names, and old Interaction identities must be rebound to the native composition path rather than preserved byte-for-byte. |
| `src/storage/learner-home-owner.ts` | Behavioral oracle with a possible small implementation candidate | Single-writer truth and abrupt-exit recovery remain required. First test the inherited process/database ownership mechanics; do not install a second lock merely to preserve this API. |
| `src/interaction/records.ts`, `src/runtime/**`, `src/cli.ts`, and `src/providers/deepseek.ts` | Black-box oracle, then retire | These files are the superseded partial generic harness/provider path. Their observable failure and continuity cases inform native tests; no fork code may import them or wrap them. The inherited provider registry and v1 Session runtime replace them. |
| `src/storage/open-database.ts` and `src/storage/system-state.ts` | Behavioral oracle, then retire | The old six-version schema and singleton revision are not migration targets. Preserve atomicity, migration-failure, chronology, and recovery cases; express them against the new Repa database identity and separate learning authorities. |

No entire current production directory is pre-approved for copying. A carry
candidate still has to pass a local reduction check:

1. name the current native consumer and invariant;
2. inspect the inherited or standard mechanism that may already own it;
3. demonstrate the missing behavior with a focused test;
4. carry or reimplement only the smallest independent logic;
5. prove there is no import of the old database, runner, or compatibility API.

## Test-suite ledger

### Tests that may cross mostly intact

- strict explicit-offset timestamp unit tests;
- pure Markdown digest/parser cases, after separating them from old workspace
  authority; and
- pinned-reference/provenance checks where the reference boundary still
  exists.

Even these tests must target the native package layout; their old import paths
are not compatibility requirements.

### Tests whose behavior must be ported

- admitted learner occurrence versus repeated text or synthetic replay;
- Turn/model-operation/tool identities and truthful terminal recovery;
- atomic domain effect and exact tool settlement;
- semantic replay, physical retry, conflict, stale source, and second-writer
  behavior;
- bounded context cuts and fresh-Session learning continuity;
- Course View correction, route movement, and lazy material;
- Agenda source, correction, disposition, and conditional-purpose behavior;
  and
- source revision drift and fail-closed selectors.

These tests currently instantiate the old schema and call the old APIs. For
each native gate, port only the cases that prove that gate. Do not mechanically
rewrite every old test before a native consumer exists.

### Tests retired with their implementation

- migrations among old Repa schema versions 1 through 6;
- exact old AI SDK runner or DeepSeek adapter API shape; and
- exact provider-visible prompt/tool bytes that intentionally change under
  native Tutor composition.

Retirement is allowed only after the native suite covers the underlying
failure property. For example, old migration-version fixtures disappear, but
unknown/future database rejection and transactional migration rollback remain.

## Lab ledger

| Lab | Disposition after fork work begins |
| --- | --- |
| `teach-adapt-return-pressure` | Keep as an isolated deterministic collision oracle until native tests cover the remaining same-Turn completed-assistant and assistance-condition cases; then delete as its README already requires. |
| `source-reference-anchor` | Keep as an isolated source-lineage oracle until native source/artifact tests cover drift, durable observation identity, and fail-closed missing bytes; then retire the fixture vocabulary. |
| `route-representation-pressure` | Findings are already promoted. Keep as cheap historical/deterministic evidence during Course View work; it need not become a production or migration suite. |
| `learning-semantic-anchor` | Historical deterministic oracle. Port only still-accepted distinctions; delete after native contracts cover them, as its README requires. |
| `learning-native-capability` | Historical isolated schema/runtime experiment. It must never be imported or treated as a shortcut to the native schema. Preserve its conclusions; no ongoing runnable guarantee is required. |
| `shared-tutor-policy-pressure` | The harness directly imports the old runner, database, prompt, tools, and provider adapter. Freeze its fixtures, recorded provider inputs/outputs, review packets, and verdicts as black-box evidence. Do not maintain it by adding a dual-runtime adapter. Rebuild a native campaign only if a later Tutor-policy decision needs it. |
| `selected-current-purpose-pressure` | Preserve promoted conditional-purpose conclusions and independent deterministic protocols. Its live run scripts that import the old provider/runner retire with that runner; they are not cutover blockers. |
| `deepseek-learning-loop` | Historical research and deterministic oracles, not a production dependency. Preserve promoted research and frozen packages. Frozen formal packages are exact historical bytes and are never rerun or silently refreshed. |

Production code continues to be forbidden from importing `labs/`. A lab that
stops running after its production dependency is deliberately retired is not
automatically a regression. Its accepted invariant must already be present in
a native test or owning document; otherwise deletion is premature.

## Fork retirement boundary

The paths above now live only in the immutable pre-fork oracle and are not
physical deletion targets. The following conditions govern removal of a
transitional implementation that actually exists in the fork, or retirement of
a carry candidate after it has been admitted there:

1. the native gate names the replacement identity and owner;
2. a positive case and the relevant failure/correction cases pass;
3. restart or replay truth is demonstrated where durable state is involved;
4. the old implementation is no longer the only executable oracle; and
5. the fork contains no import, subprocess bridge, dual write, or compatibility
   wrapper to the old runtime.

The final cutover may therefore remove obsolete transitional code from the fork
without preserving a second runtime. It does not edit the oracle. What is
re-expressed in the fork is selected by demonstrated consumer behavior, not by
directory name or implementation effort already spent.

## Remaining evidence-owned choices

Two choices remain intentionally unresolved and do not require a product
preference answer now:

- which carry candidates survive comparison with the inherited OpenCode
  implementation; and
- which already accepted learning command is the smallest honest first
  consumer of the native atomic transaction seam.

They are settled by the fork baseline and an isolated transaction proof,
respectively. Choosing them before that evidence would turn this audit into a
speculative port list.
